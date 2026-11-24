// Creates Outflow's plans in your Stripe account, sets up the Customer Portal and (optionally) the webhook.
// Safe to run again: anything that already exists is left alone.
//
//   npm run stripe:setup                                   products, prices and portal
//   npm run stripe:setup -- https://outflow.radivarius.com    also creates the webhook and prints its secret
//
// Reads STRIPE_SECRET_KEY from .env.local. Use the test key (sk_test_...) until you go live, then run it again
// with the live key: test and live mode have separate products, prices, portal settings and webhooks.
import Stripe from "stripe";
import { ALL_PLANS as PLANS, lookupKey, type Interval } from "../src/lib/billing/plans";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("Set STRIPE_SECRET_KEY in .env.local first (Stripe dashboard → Developers → API keys).");
  process.exit(1);
}
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live_") ? "LIVE" : "test";
const appUrl = process.argv[2]?.replace(/\/$/, "");

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.voided",
  "invoice.marked_uncollectible",
];

async function main() {
  console.log(`Stripe ${mode} mode\n`);
  const keys = PLANS.flatMap((p) => (["month", "year"] as Interval[]).map((i) => lookupKey(p.id, i)));
  const existing = new Map((await stripe.prices.list({ lookup_keys: keys, limit: 100 })).data.map((p) => [p.lookup_key!, p]));
  const portalProducts: { product: string; prices: string[] }[] = [];

  for (const plan of PLANS) {
    const found = await stripe.products.search({ query: `metadata['plan']:'${plan.id}' AND metadata['app']:'contract-radar'` });
    const product =
      found.data[0] ??
      (await stripe.products.create({
        name: `Outflow ${plan.name}`,
        description: plan.blurb,
        metadata: { app: "contract-radar", plan: plan.id },
        tax_code: "txcd_10103001", // Software as a service (SaaS), business use
      }));
    if (found.data[0] && product.name !== `Outflow ${plan.name}`) {
      // Renamed from Contract Radar: keep the same product (and its subscriptions), just update the name.
      await stripe.products.update(product.id, { name: `Outflow ${plan.name}` });
      product.name = `Outflow ${plan.name}`;
      console.log(`renamed  product ${product.name}`);
    }
    console.log(`${found.data[0] ? "exists " : "created"}  product ${product.name}`);
    const prices: string[] = [];
    for (const interval of ["month", "year"] as Interval[]) {
      const lk = lookupKey(plan.id, interval);
      let price = existing.get(lk);
      if (!price) {
        price = await stripe.prices.create({
          product: product.id,
          currency: "eur",
          unit_amount: plan.fallback[interval] * 100,
          recurring: { interval },
          lookup_key: lk,
          tax_behavior: "exclusive",
          metadata: { app: "contract-radar", plan: plan.id },
        });
        console.log(`created  price ${lk}: €${plan.fallback[interval]} / ${interval}`);
      } else {
        console.log(`exists   price ${lk}: €${(price.unit_amount ?? 0) / 100} / ${interval}`);
      }
      prices.push(price.id);
    }
    portalProducts.push({ product: product.id, prices });
  }

  // Customer Portal: switch plan, update card, invoices, cancel at period end.
  const portal: Stripe.BillingPortal.ConfigurationCreateParams = {
    name: "Outflow",
    business_profile: { headline: "Manage your Outflow plan" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["name", "email", "address", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] } },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price", "promotion_code"],
        proration_behavior: "create_prorations",
        products: portalProducts,
      },
    },
  };
  const defaults = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (defaults.data[0]) {
    await stripe.billingPortal.configurations.update(defaults.data[0].id, portal);
    console.log("updated  Customer Portal settings");
  } else {
    await stripe.billingPortal.configurations.create(portal);
    console.log("created  Customer Portal settings");
  }

  if (appUrl) {
    const url = `${appUrl}/api/stripe/webhook`;
    const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
    const hook = hooks.data.find((h) => h.url === url);
    if (hook) {
      await stripe.webhookEndpoints.update(hook.id, { enabled_events: WEBHOOK_EVENTS });
      console.log(`exists   webhook ${url}`);
      console.log("         Its signing secret is under Developers → Webhooks → this endpoint → Signing secret.");
    } else {
      const created = await stripe.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, description: "Outflow subscriptions" });
      console.log(`created  webhook ${url}`);
      console.log(`\nAdd this to Vercel (and .env.local) as STRIPE_WEBHOOK_SECRET:\n\n  ${created.secret}\n`);
    }
  } else {
    console.log("\nNo app URL given, so no webhook was created. Run again with your URL to add it, for example:");
    console.log("  npm run stripe:setup -- https://outflow.radivarius.com");
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
