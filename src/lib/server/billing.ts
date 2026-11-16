import "server-only";
import { cache } from "react";
import Stripe from "stripe";
import { lookupKey, planById, planFromLookupKey, PLANS, TRIAL_DAYS, TRIAL_PLAN, type BillingSummary, type Interval, type PlanId } from "@/lib/billing/plans";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "./admin";

let _stripe: Stripe | null = null;
/** Stripe client, or null when STRIPE_SECRET_KEY isn't set (billing switched off). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key, { appInfo: { name: "Contract Radar" } });
  return _stripe;
}

export const isBillingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY?.trim());
export const isTestMode = () => (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");

export interface BillingRow {
  workspace_id: string;
  trial_ends_at: string;
  complimentary: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  plan: PlanId | null;
  billing_interval: Interval | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

const OFF: BillingSummary = {
  enabled: false,
  access: true,
  state: "off",
  plan: null,
  interval: null,
  trialEndsAt: null,
  trialDaysLeft: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasCustomer: false,
  limits: { contracts: null, people: null },
};

const DAY = 86_400_000;

/** Turns the stored row into what the app shows and enforces. Pure, so it is easy to test. */
export function summarize(row: BillingRow | null, now = Date.now()): BillingSummary {
  const trialEnd = row ? Date.parse(row.trial_ends_at) : now + TRIAL_DAYS * DAY;
  const base = {
    ...OFF,
    enabled: true,
    trialEndsAt: new Date(trialEnd).toISOString(),
    trialDaysLeft: Math.max(0, Math.ceil((trialEnd - now) / DAY)),
    hasCustomer: Boolean(row?.stripe_customer_id),
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
    interval: row?.billing_interval ?? null,
  };
  const limitsOf = (id: PlanId) => {
    const p = planById(id)!;
    return { contracts: p.contracts, people: p.people };
  };

  if (row?.complimentary) return { ...base, access: true, state: "complimentary", plan: "business", limits: { contracts: null, people: null } };

  const status = row?.status ?? null;
  if (row?.plan && (status === "active" || status === "trialing")) {
    return { ...base, access: true, state: "active", plan: row.plan, limits: limitsOf(row.plan) };
  }
  // Card payment failed: Stripe keeps retrying for a while, so keep the workspace open and show a warning.
  if (row?.plan && status === "past_due") {
    return { ...base, access: true, state: "past_due", plan: row.plan, limits: limitsOf(row.plan) };
  }
  if (now < trialEnd) return { ...base, access: true, state: "trial", plan: null, limits: limitsOf(TRIAL_PLAN) };
  return { ...base, access: false, state: status ? "canceled" : "trial_ended", plan: row?.plan ?? null, limits: { contracts: 0, people: 0 } };
}

/** The signed-in workspace's billing, read as the user (RLS). Cached for the request. */
export const getBilling = cache(async (workspaceId: string): Promise<BillingSummary> => {
  if (!isSupabaseConfigured || !isBillingConfigured()) return OFF;
  const supabase = await createClient();
  const { data, error } = await supabase.from("workspace_billing").select("*").eq("workspace_id", workspaceId).maybeSingle();
  // Table not created yet (SQL not run): leave everything open rather than locking people out.
  if (error) return OFF;
  return summarize((data as BillingRow | null) ?? null);
});

/** Reads the row with the service role (webhook, checkout). Creates it if it is missing. */
export async function getBillingRowAdmin(workspaceId: string): Promise<BillingRow | null> {
  const db = adminClient();
  if (!db) return null;
  const { data } = await db.from("workspace_billing").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (data) return data as BillingRow;
  const ins = await db.from("workspace_billing").insert({ workspace_id: workspaceId }).select("*").single();
  return (ins.data as BillingRow | null) ?? null;
}

export interface PlanPrice {
  plan: PlanId;
  interval: Interval;
  priceId: string | null;
  /** In major units (euros). */
  amount: number;
  currency: string;
}

/** Live prices from Stripe by lookup key, with the fallback amounts for anything not set up yet. */
export async function getPrices(): Promise<PlanPrice[]> {
  const keys = PLANS.flatMap((p) => (["month", "year"] as Interval[]).map((i) => lookupKey(p.id, i)));
  const found = new Map<string, Stripe.Price>();
  const stripe = getStripe();
  if (stripe) {
    try {
      const res = await stripe.prices.list({ lookup_keys: keys, active: true, limit: 100 });
      for (const pr of res.data) if (pr.lookup_key) found.set(pr.lookup_key, pr);
    } catch {
      // Bad key or network: show the fallback amounts.
    }
  }
  return PLANS.flatMap((p) =>
    (["month", "year"] as Interval[]).map((interval) => {
      const pr = found.get(lookupKey(p.id, interval));
      return {
        plan: p.id,
        interval,
        priceId: pr?.id ?? null,
        amount: pr?.unit_amount != null ? pr.unit_amount / 100 : p.fallback[interval],
        currency: (pr?.currency ?? "eur").toUpperCase(),
      };
    }),
  );
}

function planOfPrice(price: Stripe.Price): { plan: PlanId; interval: Interval } | null {
  const fromKey = planFromLookupKey(price.lookup_key);
  if (fromKey) return fromKey;
  const meta = price.metadata?.plan;
  if (meta === "starter" || meta === "growth" || meta === "business") {
    return { plan: meta, interval: price.recurring?.interval === "year" ? "year" : "month" };
  }
  return null;
}

/**
 * Copies a subscription's current state from Stripe into workspace_billing. Always re-reads the subscription,
 * so webhook events that arrive out of order can't leave a stale status behind.
 */
export async function syncSubscription(subscriptionId: string): Promise<{ workspaceId: string | null; status: string }> {
  const stripe = getStripe();
  const db = adminClient();
  if (!stripe || !db) throw new Error("STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  let workspaceId = sub.metadata?.workspace_id || null;
  if (!workspaceId) {
    const { data } = await db.from("workspace_billing").select("workspace_id").eq("stripe_customer_id", customerId).maybeSingle();
    workspaceId = (data?.workspace_id as string | undefined) ?? null;
  }
  if (!workspaceId) return { workspaceId: null, status: sub.status };

  const item = sub.items.data[0];
  const mapped = item ? planOfPrice(item.price) : null;
  const patch = {
    workspace_id: workspaceId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    plan: mapped?.plan ?? null,
    billing_interval: mapped?.interval ?? (item?.price.recurring?.interval === "year" ? "year" : "month"),
    stripe_price_id: item?.price.id ?? null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    updated_at: new Date().toISOString(),
  };

  // A workspace has one current subscription. Don't let an old, canceled one overwrite a newer live one.
  const { data: existing } = await db.from("workspace_billing").select("stripe_subscription_id, status").eq("workspace_id", workspaceId).maybeSingle();
  const live = (s: string | null | undefined) => s === "active" || s === "trialing" || s === "past_due";
  if (existing?.stripe_subscription_id && existing.stripe_subscription_id !== sub.id && live(existing.status) && !live(sub.status)) {
    return { workspaceId, status: "ignored (older subscription)" };
  }

  const { error } = await db.from("workspace_billing").upsert(patch, { onConflict: "workspace_id" });
  if (error) throw new Error(error.message);
  return { workspaceId, status: sub.status };
}

/** For API routes that add data: a short reason when the workspace's trial has ended, else null. */
export async function lockedReason(workspaceId: string): Promise<string | null> {
  return lockedMessage(await getBilling(workspaceId));
}

function lockedMessage(b: BillingSummary): string | null {
  if (b.access) return null;
  return b.state === "canceled"
    ? "Your subscription has ended. Choose a plan on the Billing page to keep using Contract Radar."
    : "Your free trial has ended. Choose a plan on the Billing page to keep using Contract Radar.";
}

function limitMessage(b: BillingSummary, kind: "contracts" | "people", current: number): string | null {
  const locked = lockedMessage(b);
  if (locked) return locked;
  const max = b.limits[kind];
  if (max == null || current < max) return null;
  const name = planById(b.plan)?.name ?? (b.state === "trial" ? "trial" : "current");
  return kind === "contracts"
    ? `Your ${name} plan includes ${max} contracts. Upgrade on the Billing page to add more.`
    : `Your ${name} plan includes ${max} people (including pending invites). Upgrade on the Billing page to invite more.`;
}

/** Checks a count against the plan's limit. Returns a message when the limit is reached. */
export async function limitReason(workspaceId: string, kind: "contracts" | "people", current: number): Promise<string | null> {
  return limitMessage(await getBilling(workspaceId), kind, current);
}

/** Same check for server jobs with no signed-in user (the email inbox), read with the service role. */
export async function limitReasonAdmin(workspaceId: string, kind: "contracts" | "people", current: number): Promise<string | null> {
  if (!isBillingConfigured()) return null;
  return limitMessage(summarize(await getBillingRowAdmin(workspaceId)), kind, current);
}

/** Public address for Stripe redirect URLs: APP_URL when set, otherwise the request's own origin. */
export function appOrigin(req: Request): string {
  return process.env.APP_URL?.trim().replace(/\/$/, "") || new URL(req.url).origin;
}
