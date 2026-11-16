import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { lookupKey, type Interval, type PlanId } from "@/lib/billing/plans";
import { requireSession } from "@/lib/server/api";
import { adminClient } from "@/lib/server/admin";
import { appOrigin, getBillingRowAdmin, getStripe } from "@/lib/server/billing";

export const runtime = "nodejs";

// Starts Stripe Checkout for a plan. Admins only. Returns { url } to send the browser to.
export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { session } = ctx;
  if (session.role !== "owner") return NextResponse.json({ error: "Only workspace admins can change the plan." }, { status: 403 });

  const stripe = getStripe();
  const db = adminClient();
  if (!stripe) return NextResponse.json({ error: "Billing isn't set up yet: STRIPE_SECRET_KEY is missing." }, { status: 503 });
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is missing, so billing can't be saved." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { plan?: unknown; interval?: unknown };
  const plan = ["starter", "growth", "business"].includes(String(body.plan)) ? (body.plan as PlanId) : null;
  const interval: Interval = body.interval === "year" ? "year" : "month";
  if (!plan) return NextResponse.json({ error: "Pick a plan." }, { status: 400 });

  const prices = await stripe.prices.list({ lookup_keys: [lookupKey(plan, interval)], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) {
    return NextResponse.json(
      { error: `No Stripe price with lookup key ${lookupKey(plan, interval)}. Run npm run stripe:setup (docs/billing-setup.md).` },
      { status: 503 },
    );
  }

  const row = await getBillingRowAdmin(session.workspace.id);
  if (!row) return NextResponse.json({ error: "Run supabase/migrations/20261116180000_billing.sql in the Supabase SQL editor first." }, { status: 503 });
  const origin = appOrigin(req);

  // Already subscribed: plan changes and cancellations happen in the Customer Portal, not a second checkout.
  if (row.stripe_customer_id && ["active", "trialing", "past_due"].includes(row.status ?? "")) {
    const portal = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: `${origin}/billing` });
    return NextResponse.json({ url: portal.url });
  }

  let customerId = row.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.email || undefined,
      name: session.workspace.name,
      metadata: { workspace_id: session.workspace.id },
    });
    customerId = customer.id;
    const { error } = await db.from("workspace_billing").update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }).eq("workspace_id", session.workspace.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Subscribing during the free trial keeps the remaining trial days: the card is charged when the trial ends.
  // Stripe needs a trial end at least 48 hours away.
  const trialEnd = Math.floor(Date.parse(row.trial_ends_at) / 1000);
  const keepTrial = !row.stripe_subscription_id && trialEnd > Math.floor(Date.now() / 1000) + 49 * 3600;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: customerId,
    client_reference_id: session.workspace.id,
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: {
      metadata: { workspace_id: session.workspace.id, plan },
      ...(keepTrial ? { trial_end: trialEnd } : {}),
    },
    metadata: { workspace_id: session.workspace.id, plan },
    allow_promotion_codes: true,
    billing_address_collection: "required",
    // B2B: let companies add their VAT number so it shows on the invoice (EU reverse charge).
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=canceled`,
  };
  try {
    const checkout = await stripe.checkout.sessions.create(params);
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
