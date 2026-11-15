"use client";

import Link from "next/link";
import { usePortfolio } from "@/lib/portfolio";
import { renewalMath } from "@/lib/engine";
import { shortDate, usd } from "@/lib/format";
import { Card, H2, PageHeader, VendorLogo } from "@/components/ui";

const PRICING_CHANGES = [
  {
    contractId: "hubspot",
    date: "2026-11-04",
    change: "Marketing Hub contact tiers move from annual to monthly billing, with overage charged per 1,000 contacts.",
    impact: "Up to $18,000 / yr at your current contact growth",
  },
  {
    contractId: "slack",
    date: "2026-10-21",
    change: "Business+ list price rises from $13 to $15 per user / month for new and renewing annual plans.",
    impact: "Your order form has no cap, so this applies at the Dec 20 renewal",
  },
];

export default function PriceChangesPage() {
  const { contracts: CONTRACTS, showSample } = usePortfolio();
  const quoted = CONTRACTS.filter((c) => c.quote);
  const uncapped = CONTRACTS.filter((c) => c.uploaded && c.autoRenew && c.upliftCapPct == null);
  return (
    <>
      <PageHeader eyebrow="Renewal quotes checked against your contract caps, plus pricing and terms pages we watch" title="Price changes" />

      {uncapped.length > 0 && (
        <Card label="Uploaded contracts with no price cap" className="flex flex-col gap-3 p-5">
          <H2>No cap on renewal increases</H2>
          <p className="m-0 text-[13px] text-muted">
            These contracts auto-renew and we found no limit on how much the vendor can raise the price. Negotiate a cap
            before the notice deadline.
          </p>
          {uncapped.map((c) => (
            <Link key={c.id} href={`/contracts/${c.id}`} className="flex items-center gap-3.5 rounded-xl border border-line-soft px-4 py-3 text-ink hover:bg-[#F8FAFC]">
              <VendorLogo initials={c.initials} hue={c.hue} />
              <div className="flex flex-1 flex-col">
                <span className="font-semibold">{c.vendor}</span>
                <span className="text-[13px] text-muted">{c.documents[0]}</span>
              </div>
              <span className="rounded-full bg-warn-soft px-3 py-1 text-[13px] font-semibold text-warn-text">No cap found</span>
            </Link>
          ))}
        </Card>
      )}

      {quoted.length > 0 && (
      <Card label="Renewal quotes vs caps" className="flex flex-col gap-3 p-5">
        <H2>Renewal quotes vs. caps</H2>
        {quoted.map((c) => {
          const m = renewalMath(c);
          const over = m.cappedFee != null && m.quotedFee != null && m.quotedFee > m.cappedFee;
          return (
            <Link key={c.id} href={`/contracts/${c.id}`} className="flex flex-wrap items-center gap-3.5 rounded-xl border border-line-soft px-4 py-3 text-ink hover:bg-[#F8FAFC]">
              <VendorLogo initials={c.initials} hue={c.hue} />
              <div className="flex min-w-[220px] flex-1 flex-col">
                <span className="font-semibold">{c.vendor} {c.product}</span>
                <span className="text-[13px] text-muted">
                  Quote received {shortDate(c.quote!.receivedOn)}: {usd(m.currentFee)} → {usd(m.quotedFee!)} (+{m.quoteIncreasePct}%), cap {c.upliftCapPct ?? "none"}%
                </span>
              </div>
              {over ? (
                <span className="rounded-full bg-warn-soft px-3 py-1 text-[13px] font-semibold text-warn-text">
                  {usd(m.capSavings)} over cap
                </span>
              ) : (
                <span className="rounded-full bg-good-soft px-3 py-1 text-[13px] font-semibold text-good-dark">Within cap</span>
              )}
            </Link>
          );
        })}
      </Card>
      )}

      {showSample && (
      <Card label="Pricing and terms radar" className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <H2>Pricing &amp; terms radar</H2>
          <span className="text-[13px] text-muted">Watching pricing and ToS pages for 64 vendors · sample data</span>
        </div>
        {PRICING_CHANGES.map((p) => {
          const c = CONTRACTS.find((x) => x.id === p.contractId)!;
          return (
            <Link key={p.contractId} href={`/contracts/${c.id}`} className="flex items-start gap-3.5 rounded-xl border border-line-soft px-4 py-3 text-ink hover:bg-[#F8FAFC]">
              <VendorLogo initials={c.initials} hue={c.hue} />
              <div className="flex flex-1 flex-col gap-1">
                <span className="font-semibold">
                  {c.vendor} · changed {shortDate(p.date)}
                </span>
                <span className="text-sm text-ink-2">{p.change}</span>
                <span className="text-[13px] font-medium text-brand-dark">{p.impact}</span>
              </div>
            </Link>
          );
        })}
      </Card>
      )}
      {!showSample && uncapped.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted">
          Nothing to flag yet. Upload renewal quotes and contracts and we&apos;ll check them against your caps.
        </Card>
      )}
    </>
  );
}
