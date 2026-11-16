// Plans and their limits. Prices live in Stripe: each plan has a monthly and a yearly price, found by its
// lookup key (for example "cr_growth_year"). Change a price in Stripe (new price, move the lookup key to it)
// and the app picks it up with no code change. The amounts below are only shown when Stripe isn't set up yet.

export type PlanId = "starter" | "growth" | "business";
export type Interval = "month" | "year";

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
  /** null = unlimited */
  contracts: number | null;
  /** People in the workspace, counting pending invites. null = unlimited */
  people: number | null;
  features: string[];
  /** Fallback display prices in EUR, used only until Stripe prices exist. */
  fallback: Record<Interval, number>;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    blurb: "For a finance lead getting renewals under control.",
    contracts: 25,
    people: 5,
    features: ["25 contracts read by AI", "5 people", "Renewal reminders and calendar", "Pushback emails drafted by AI"],
    fallback: { month: 199, year: 1990 },
  },
  {
    id: "growth",
    name: "Growth",
    blurb: "For finance and department owners working together.",
    contracts: 150,
    people: 25,
    features: ["150 contracts read by AI", "25 people", "Auto-discovery from accounting and sign-in data", "Everything in Starter"],
    fallback: { month: 499, year: 4990 },
  },
  {
    id: "business",
    name: "Business",
    blurb: "For companies with a large SaaS portfolio.",
    contracts: null,
    people: null,
    features: ["Unlimited contracts", "Unlimited people", "Onboarding call and priority support", "Everything in Growth"],
    fallback: { month: 999, year: 9990 },
  },
];

/** Limits during the free trial (and for complimentary workspaces: unlimited). */
export const TRIAL_PLAN: PlanId = "growth";
export const TRIAL_DAYS = 14;

export const lookupKey = (plan: PlanId, interval: Interval) => `cr_${plan}_${interval}`;

export function planFromLookupKey(key: string | null | undefined): { plan: PlanId; interval: Interval } | null {
  const m = /^cr_(starter|growth|business)_(month|year)$/.exec(key ?? "");
  return m ? { plan: m[1] as PlanId, interval: m[2] as Interval } : null;
}

export const planById = (id: PlanId | null | undefined) => PLANS.find((p) => p.id === id) ?? null;

/** What the browser needs to know about the workspace's billing. */
export interface BillingSummary {
  /** Billing is switched on (Stripe key set and the billing table exists). When false nothing is gated. */
  enabled: boolean;
  /** The workspace can use the app. */
  access: boolean;
  state: "trial" | "trial_ended" | "active" | "past_due" | "canceled" | "complimentary" | "off";
  plan: PlanId | null;
  interval: Interval | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  limits: { contracts: number | null; people: number | null };
}
