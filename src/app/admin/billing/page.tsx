import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { BillingPill, day, Pill, SetupNeeded, Stat, Th } from "@/components/admin/bits";
import { planById } from "@/lib/billing/plans";
import { isBillingConfigured, isTestMode } from "@/lib/server/billing";
import { getPlatformCtx } from "@/lib/server/platform";
import { loadWorkspaces, stripeDashboardUrl } from "@/lib/server/platform-data";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Paying" },
  { value: "past_due", label: "Payment failed" },
  { value: "trial", label: "In trial" },
  { value: "trial_ended", label: "Trial ended" },
  { value: "canceled", label: "Cancelled" },
  { value: "complimentary", label: "Free forever" },
];

export default async function AdminBilling({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const { state = "" } = await searchParams;
  const all = (await loadWorkspaces(ctx.db)).filter((w) => !w.isDemo);
  const list = all.filter((w) => !state || w.billing?.state === state).sort((a, b) => (Date.parse(a.billing?.trialEndsAt ?? "") || 0) - (Date.parse(b.billing?.trialEndsAt ?? "") || 0));
  const count = (s: string) => all.filter((w) => w.billing?.state === s).length;
  // Rough monthly recurring revenue from the plan list prices (Stripe has the exact figures).
  const mrr = all
    .filter((w) => w.billing?.state === "active" || w.billing?.state === "past_due")
    .reduce((sum, w) => {
      const p = planById(w.billing?.plan);
      if (!p) return sum;
      return sum + (w.billing?.interval === "year" ? p.fallback.year / 12 : p.fallback.month);
    }, 0);

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Subscriptions">
        {isBillingConfigured() && (
          <>
            <Pill tone={isTestMode() ? "warn" : "good"}>Stripe {isTestMode() ? "test mode" : "live"}</Pill>
            <a href={`https://dashboard.stripe.com/${isTestMode() ? "test/" : ""}subscriptions`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand">Stripe dashboard ↗</a>
          </>
        )}
      </PageHeader>
      {!isBillingConfigured() && <SetupNeeded>Billing is off: STRIPE_SECRET_KEY isn&apos;t set. Every workspace has full access.</SetupNeeded>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Paying" value={count("active")} sub={`about €${Math.round(mrr).toLocaleString("en-GB")} a month at list price`} />
        <Stat label="In trial" value={count("trial")} />
        <Stat label="Payment failed" value={count("past_due")} tone={count("past_due") ? "bad" : undefined} />
        <Stat label="Free forever" value={count("complimentary")} />
      </div>

      <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/admin/billing?state=${f.value}` : "/admin/billing"}
            aria-current={state === f.value ? "page" : undefined}
            className={state === f.value ? "rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-white" : "rounded-full bg-chip px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-line"}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <Card label="Subscriptions" className="rtable-wrap overflow-x-auto">
        <table className="rtable w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <Th>Workspace</Th>
              <Th>State</Th>
              <Th>Trial ends</Th>
              <Th>Renews / ends</Th>
              <Th>Stripe</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id} className="border-t border-line-soft">
                <td className="rt-full px-5 py-3">
                  <Link href={`/admin/workspaces/${w.id}`} className="font-semibold text-ink">{w.name}</Link>
                  <span className="block text-xs text-muted">{w.admins[0] ?? ""}</span>
                </td>
                <td data-label="State" className="px-3 py-3"><BillingPill billing={w.billing} /></td>
                <td data-label="Trial ends" className="px-3 py-3 text-ink-2">{w.billing?.state === "trial" || w.billing?.state === "trial_ended" ? day(w.billing.trialEndsAt) : "—"}</td>
                <td data-label="Renews / ends" className="px-3 py-3 text-ink-2">{w.billing?.currentPeriodEnd ? `${w.billing.cancelAtPeriodEnd ? "Ends" : "Renews"} ${day(w.billing.currentPeriodEnd)}` : "—"}</td>
                <td data-label="Stripe" className="px-5 py-3">
                  {w.billingRow?.stripe_customer_id ? (
                    <a href={stripeDashboardUrl("customers", w.billingRow.stripe_customer_id)} target="_blank" rel="noreferrer" className="font-semibold text-brand">Customer ↗</a>
                  ) : (
                    <span className="text-muted">No customer yet</span>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
