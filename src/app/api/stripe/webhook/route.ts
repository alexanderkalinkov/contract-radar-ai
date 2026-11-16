import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, syncSubscription } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe sends subscription changes here (docs/billing-setup.md). Each one is copied to workspace_billing.
// Events to send: checkout.session.completed, customer.subscription.created, .updated, .deleted, .paused, .resumed,
// invoice.paid, invoice.payment_failed.
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) return NextResponse.json({ error: "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET." }, { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe-Signature header." }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
  }

  let subscriptionId: string | null = null;
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode === "subscription" && s.subscription) subscriptionId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      subscriptionId = event.data.object.id;
      break;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const sub = event.data.object.parent?.subscription_details?.subscription;
      if (sub) subscriptionId = typeof sub === "string" ? sub : sub.id;
      break;
    }
  }
  if (!subscriptionId) return NextResponse.json({ received: true, ignored: event.type });

  try {
    const result = await syncSubscription(subscriptionId);
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    // 500 makes Stripe retry the event later.
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
