"use client";

import Link from "next/link";
import { usePortfolio } from "@/lib/portfolio";
import { SampleDataNote } from "@/components/SampleDataNote";
import { daysUntil, noticeDeadline, renewalDate } from "@/lib/engine";
import { monthKey, shortDate, usd } from "@/lib/format";
import { Card, cx, H2, PageHeader, urgencyClassFor, VendorLogo } from "@/components/ui";

type Event = { date: string; contractId: string; kind: "notice" | "renewal"; label: string; amount: number };

export default function CalendarPage() {
  const { contracts: CONTRACTS, opportunities: OPPORTUNITIES, loading } = usePortfolio();
  const events: Event[] = CONTRACTS.filter((c) => noticeDeadline(c) && c.termEnd).flatMap((c) => {
    const atStake = OPPORTUNITIES.filter((o) => o.contractId === c.id).reduce((s, o) => s + o.annualSavings, 0);
    return [
      { date: noticeDeadline(c), contractId: c.id, kind: "notice" as const, label: `Last day to give notice · ${c.deadlineLabel}`, amount: atStake },
      { date: renewalDate(c), contractId: c.id, kind: "renewal" as const, label: c.autoRenew
          ? `Renews for ${c.renewalTermMonths} months${c.annualFee ? ` at ${usd(c.quote?.annualFee ?? c.annualFee)}` : ""}`
          : "Term ends", amount: 0 },
    ];
  })
    .filter((e) => daysUntil(e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const months = events.reduce<Record<string, Event[]>>((acc, e) => {
    (acc[monthKey(e.date)] ??= []).push(e);
    return acc;
  }, {});

  return (
    <>
      <PageHeader eyebrow="Every notice and renewal date we found in your contracts" title="Renewal calendar">
        <span className="inline-flex min-h-11 items-center rounded-[10px] border border-dashed border-[#D0D5DD] px-4 text-sm text-muted">
          Export to iCal / Google Calendar (coming soon)
        </span>
      </PageHeader>
      <SampleDataNote />
      {!loading && events.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted">
          No upcoming dates yet. <Link href="/upload" className="font-semibold text-brand">Upload a contract</Link> to add its notice and renewal dates.
        </Card>
      )}
      {Object.entries(months).map(([month, list]) => (
        <Card key={month} label={month} className="flex flex-col gap-3 p-5">
          <H2>{month}</H2>
          {list.map((e) => {
            const c = CONTRACTS.find((x) => x.id === e.contractId)!;
            const days = daysUntil(e.date);
            return (
              <Link key={e.contractId + e.kind} href={`/contracts/${c.id}`} className="flex items-center gap-3.5 rounded-lg py-1 text-ink hover:bg-[#F8FAFC]">
                <div className={cx("flex h-12 w-12 flex-none flex-col items-center justify-center rounded-[10px]", e.kind === "notice" ? urgencyClassFor(days) : "bg-chip text-ink-2")}>
                  <span className="text-[10px] font-bold tracking-wider uppercase">{shortDate(e.date).split(" ")[0]}</span>
                  <span className="font-display text-lg leading-none font-semibold">{shortDate(e.date).split(" ")[1]}</span>
                </div>
                <VendorLogo initials={c.initials} hue={c.hue} size={32} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">
                    {c.vendor} {c.product}
                    {c.uploaded && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">Uploaded</span>}
                  </span>
                  <span className="text-[13px] text-muted">{e.label}</span>
                </div>
                {e.amount > 0 && <span className="text-[13px] font-semibold text-good">{usd(e.amount)} at stake</span>}
              </Link>
            );
          })}
        </Card>
      ))}
    </>
  );
}
