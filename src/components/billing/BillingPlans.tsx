"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { planById, PLANS, SAVINGS_PLAN, type BillingSummary, type Interval, type Plan, type PlanId } from "@/lib/billing/plans";
import { FEE_CAP, FEE_RATE, pct } from "@/lib/billing/savings";
import { btnGhost, btnPrimary, Card, cx, H2, Segmented } from "@/components/ui";

interface PlanPrice {
  plan: PlanId;
  interval: Interval;
  priceId: string | null;
  amount: number;
  currency: string;
}

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);

export function BillingPlans({
  billing,
  prices,
  isAdmin,
  configured,
  testMode,
  checkout,
}: {
  billing: BillingSummary;
  prices: PlanPrice[];
  isAdmin: boolean;
  configured: boolean;
  testMode: boolean;
  checkout: "success" | "canceled" | null;
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>(billing.interval ?? "year");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stripe tells the app about a new subscription a moment after checkout. Refresh until it shows.
  useEffect(() => {
    if (checkout !== "success" || billing.state === "active") return;
    const t = setTimeout(() => router.refresh(), 2500);
    return () => clearTimeout(t);
  }, [checkout, billing.state, router]);

  async function go(path: string, body?: object, key = path) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Something went wrong. Try again.");
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const subscribed = billing.state === "active" || billing.state === "past_due";
  const price = (plan: PlanId, i: Interval) => prices.find((p) => p.plan === plan && p.interval === i);

  return (
    <div className="flex flex-col gap-6">
      {!configured && (
        <Card className="border-warn-line bg-warn-soft p-5 text-sm text-warn-text">
          Billing is switched off: STRIPE_SECRET_KEY isn&apos;t set, so nothing is charged or locked. Setup steps are in docs/billing-setup.md.
        </Card>
      )}
      {configured && testMode && (
        <p className="m-0 w-fit rounded-md bg-chip px-2.5 py-1 text-xs font-semibold text-ink-2">
          Stripe test mode: pay with card 4242 4242 4242 4242, any future date and any CVC
        </p>
      )}
      {checkout === "success" && (
        <Card className="border-good-line bg-good-soft p-5 text-sm text-good-dark">
          {billing.state === "active" ? "Thanks, your plan is active." : "Thanks! Confirming your payment with Stripe…"}
        </Card>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-4 p-6" label="Current plan">
        <div className="flex flex-col gap-1">
          <H2>{statusTitle(billing)}</H2>
          <p className="m-0 text-sm text-muted">{statusDetail(billing)}</p>
        </div>
        {isAdmin && billing.hasCustomer && (
          <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => go("/api/billing/portal", undefined, "portal")}>
            {busy === "portal" ? "Opening…" : "Manage billing and invoices"}
          </button>
        )}
      </Card>

      {error && (
        <p role="alert" className="m-0 rounded-lg bg-[#FEE4E2] px-4 py-3 text-sm text-[#912018]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <H2>Plans</H2>
        <Segmented
          label="Billing period"
          value={interval}
          onChange={setInterval}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly · 2 months free" },
          ]}
        />
      </div>

      <SavingsPlanCard
        plan={SAVINGS_PLAN}
        price={price("savings", interval)}
        interval={interval}
        current={subscribed && billing.plan === "savings" && billing.interval === interval}
        isAdmin={isAdmin}
        busy={busy}
        configured={configured}
        label={subscribed ? "Switch to Savings share" : billing.state === "trial" ? "Choose Savings share" : "Subscribe to Savings share"}
        onChoose={() => (subscribed ? go("/api/billing/portal", undefined, "savings") : go("/api/billing/checkout", { plan: "savings", interval }, "savings"))}
      />

      <p className="m-0 -mb-2 text-sm font-semibold text-ink-2">Or a flat plan, for a predictable bill</p>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const p = price(plan.id, interval);
          const current = subscribed && billing.plan === plan.id && billing.interval === interval;
          const perMonth = p && interval === "year" ? p.amount / 12 : null;
          return (
            <Card key={plan.id} className={cx("flex flex-col gap-4 p-6", plan.id === "growth" && "border-brand")} label={plan.name}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 font-display text-lg font-semibold">{plan.name}</h3>
                {plan.id === "growth" && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">Most popular</span>}
              </div>
              <p className="m-0 text-sm text-muted">{plan.blurb}</p>
              {p && (
                <div className="flex flex-col">
                  <span className="font-display text-[30px] font-semibold tracking-tight">
                    {money(p.amount, p.currency)}
                    <span className="text-sm font-medium text-muted"> / {interval === "year" ? "year" : "month"}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {perMonth ? `${money(Math.round(perMonth), p.currency)} a month, billed yearly` : "Billed monthly"} · excl. VAT
                  </span>
                </div>
              )}
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-ink-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden="true" className="text-good">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {current ? (
                  <span className="inline-flex min-h-11 items-center text-sm font-semibold text-good-dark">Your current plan</span>
                ) : isAdmin ? (
                  <button
                    type="button"
                    className={cx(plan.id === "growth" ? btnPrimary : btnGhost, "w-full")}
                    disabled={busy !== null || !configured}
                    onClick={() =>
                      subscribed ? go("/api/billing/portal", undefined, plan.id) : go("/api/billing/checkout", { plan: plan.id, interval }, plan.id)
                    }
                  >
                    {busy === plan.id ? "Opening Stripe…" : subscribed ? `Switch to ${plan.name}` : billing.state === "trial" ? `Choose ${plan.name}` : `Subscribe to ${plan.name}`}
                  </button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
      {!isAdmin && <p className="m-0 text-sm text-muted">Only workspace admins can change the plan.</p>}
      {billing.state === "trial" && isAdmin && (
        <p className="m-0 text-sm text-muted">
          Choosing a plan now doesn&apos;t cut your trial short: your card is charged when the trial ends on {date(billing.trialEndsAt)}.
        </p>
      )}
    </div>
  );
}

function statusTitle(b: BillingSummary): string {
  const plan = planById(b.plan)?.name;
  switch (b.state) {
    case "off":
      return "No plan needed";
    case "complimentary":
      return "Complimentary workspace";
    case "trial":
      return `Free trial · ${b.trialDaysLeft === 1 ? "last day" : `${b.trialDaysLeft} days left`}`;
    case "trial_ended":
      return "Your free trial has ended";
    case "active":
      return `${plan ?? "Paid"} plan`;
    case "past_due":
      return `${plan ?? "Paid"} plan · payment failed`;
    case "canceled":
      return "Your subscription has ended";
  }
}

function statusDetail(b: BillingSummary): string {
  switch (b.state) {
    case "off":
      return "Billing isn't switched on for this app yet.";
    case "complimentary":
      return "This workspace is free, with no limits.";
    case "trial":
      return `Everything in Growth until ${date(b.trialEndsAt)}. No card needed until you choose a plan.`;
    case "trial_ended":
    case "canceled":
      return "Your data is saved. Choose a plan to open the workspace again.";
    case "active":
      if (b.cancelAtPeriodEnd) return `Cancels on ${date(b.currentPeriodEnd)}. You can resume it in Manage billing.`;
      return b.currentPeriodEnd ? `Renews on ${date(b.currentPeriodEnd)}.` : "Active.";
    case "past_due":
      return "Stripe couldn't charge your card. Update it in Manage billing to keep the workspace open.";
  }
}

function SavingsPlanCard({
  plan,
  price,
  interval,
  current,
  isAdmin,
  busy,
  configured,
  label,
  onChoose,
}: {
  plan: Plan;
  price: PlanPrice | undefined;
  interval: Interval;
  current: boolean;
  isAdmin: boolean;
  busy: string | null;
  configured: boolean;
  label: string;
  onChoose: () => void;
}) {
  return (
    <Card className="grid gap-5 border-brand p-6 md:grid-cols-[1.2fr_1fr]" label={plan.name}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 font-display text-lg font-semibold">{plan.name}</h3>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">No savings, no fee</span>
        </div>
        <p className="m-0 text-sm text-muted">{plan.blurb}</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-ink-2">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden="true" className="text-good">✓</span>
              {f}
            </li>
          ))}
        </ul>
        <Link href="/savings" className="w-fit text-sm font-semibold text-brand underline underline-offset-2">See your savings ledger</Link>
      </div>
      <div className="flex flex-col justify-between gap-4 rounded-xl bg-[#F8FAFC] p-5">
        <div className="flex flex-col gap-1">
          <span className="font-display text-[30px] font-semibold tracking-tight">{pct(FEE_RATE)}</span>
          <span className="text-sm text-muted">of confirmed first-year savings, at most {money(FEE_CAP, "EUR")} per saving</span>
          {price && (
            <span className="mt-2 text-sm text-ink-2">
              plus a {money(price.amount, price.currency)} / {interval === "year" ? "year" : "month"} platform fee, credited against savings fees · excl. VAT
            </span>
          )}
        </div>
        {current ? (
          <span className="inline-flex min-h-11 items-center text-sm font-semibold text-good-dark">Your current plan</span>
        ) : isAdmin ? (
          <button type="button" className={cx(btnPrimary, "w-full")} disabled={busy !== null || !configured} onClick={onChoose}>
            {busy === "savings" ? "Opening Stripe…" : label}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
