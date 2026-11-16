import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";
import { appOrigin, getBillingRowAdmin, getStripe } from "@/lib/server/billing";

export const runtime = "nodejs";

// Opens the Stripe Customer Portal: change plan, update the card, download invoices, cancel. Admins only.
export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.session.role !== "owner") return NextResponse.json({ error: "Only workspace admins can manage billing." }, { status: 403 });
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Billing isn't set up yet: STRIPE_SECRET_KEY is missing." }, { status: 503 });
  const row = await getBillingRowAdmin(ctx.session.workspace.id);
  if (!row?.stripe_customer_id) return NextResponse.json({ error: "Choose a plan first." }, { status: 400 });
  try {
    const portal = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: `${appOrigin(req)}/billing` });
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
