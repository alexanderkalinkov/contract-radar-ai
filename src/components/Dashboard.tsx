"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { COMPANY, LEVERS, SAVINGS_BY_LEVER } from "@/lib/seed";
import { usePortfolio } from "@/lib/portfolio";
import { noticeDeadline } from "@/lib/engine";
import { SampleDataNote } from "./SampleDataNote";
import { useWorkspace } from "./WorkspaceProvider";
import { daysUntil, TODAY, urgency } from "@/lib/engine";
import { longDate, shortDate, usd } from "@/lib/format";
import { useOppStatus, type OppStatus } from "@/lib/store";
import type { LeverKey, Opportunity } from "@/lib/types";
import { unusedSeats } from "@/lib/usage";
import { IconClock, IconMail, IconMore, IconUpload } from "./icons";
import { btnGhost, btnPrimary, btnSoft, Card, cx, DaysBadge, H2, PageHeader, Segmented, urgencyClassFor, VendorLogo } from "./ui";
import { DigestModal } from "./DigestModal";
import { PriceHikesCard } from "./PriceHikes";
import { TeamSetupBanner } from "./team/TeamSetupBanner";

type Filter = "all" | LeverKey;

const STATUS_LABEL: Partial<Record<OppStatus, string>> = {
  in_progress: "In progress",
  won: "Won",
  snoozed: "Snoozed",
};

export function Dashboard() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"deadline" | "value">("deadline");
  const [bannerSnoozed, setBannerSnoozed] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const { statusOf, setStatus, reset } = useOppStatus();
  const ws = useWorkspace();
  const { contracts: CONTRACTS, opportunities: OPPORTUNITIES, totals: PORTFOLIO, showSample, saved } = usePortfolio();

  const visible = OPPORTUNITIES.filter((o) => statusOf(o.id) !== "dismissed");
  const open = visible.filter((o) => statusOf(o.id) !== "won");

  const wonNow = OPPORTUNITIES.filter((o) => statusOf(o.id) === "won").reduce((s, o) => s + o.annualSavings, 0);
  const captured = PORTFOLIO.capturedThisYear + wonNow;
  const capturedPct = PORTFOLIO.identifiedSavings ? Math.round((captured / PORTFOLIO.identifiedSavings) * 100) : 0;

  const next30 = open.filter((o) => {
    const d = daysUntil(o.actBy);
    return d >= 0 && d <= 30;
  });
  const atStake = next30.reduce((s, o) => s + o.annualSavings, 0);
  const deadlineDates = Array.from(new Set(next30.map((o) => o.actBy))).sort();

  const rows = useMemo(() => {
    const list = visible.filter((o) => filter === "all" || o.lever === filter);
    const when = (o: Opportunity) => o.actBy || "9999-12-31"; // date not found in the contract: list last
    return list.slice().sort((a, b) =>
      sort === "deadline"
        ? when(a).localeCompare(when(b)) || b.annualSavings - a.annualSavings
        : b.annualSavings - a.annualSavings || when(a).localeCompare(when(b)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort, visible.length]);
  const rowTotal = rows.reduce((s, o) => s + o.annualSavings, 0);

  // Paid seats nobody signed in to, from login data (Google Workspace / Microsoft, or the sample portfolio's Okta).
  const withUsage = CONTRACTS.filter((c) => c.usage && c.seats);
  const idleSeats = withUsage.reduce((s, c) => s + unusedSeats(c.usage!), 0);
  const paidSeats = withUsage.reduce((s, c) => s + c.usage!.paid, 0);
  const idleCost = withUsage.reduce((s, c) => s + (unusedSeats(c.usage!) * c.annualFee) / c.seats, 0);

  const urgent = open
    .filter((o) => urgency(daysUntil(o.actBy)) === "urgent")
    .sort((a, b) => a.actBy.localeCompare(b.actBy));
  const banner = urgent[0];
  const bannerContract = banner && CONTRACTS.find((c) => c.id === banner.contractId);

  // Notice deadlines: one entry per contract date in the next 90 days (spec §3E).
  const deadlines: { contractId: string; vendor: string; actBy: string; amount: number }[] = Object.values(
    open.reduce<Record<string, { contractId: string; vendor: string; actBy: string; amount: number }>>((acc, o) => {
      const d = daysUntil(o.actBy);
      if (d < 0 || d > 90) return acc;
      const key = o.contractId + o.actBy;
      const c = CONTRACTS.find((x) => x.id === o.contractId)!;
      acc[key] ??= { contractId: o.contractId, vendor: c.vendor, actBy: o.actBy, amount: 0 };
      acc[key].amount += o.annualSavings;
      return acc;
    }, {}),
  );
  // Uploaded contracts show their notice date even before any savings are attached to them.
  for (const c of CONTRACTS) {
    if (!c.uploaded) continue;
    const date = noticeDeadline(c);
    const d = date ? daysUntil(date) : -1;
    if (d >= 0 && d <= 90 && !deadlines.some((x) => x.contractId === c.id && x.actBy === date))
      deadlines.push({ contractId: c.id, vendor: c.vendor, actBy: date, amount: 0 });
  }
  deadlines.sort((a, b) => a.actBy.localeCompare(b.actBy));
  deadlines.splice(5);

  const maxLever = Math.max(...SAVINGS_BY_LEVER.map((l) => l.value));
  const filterDefs: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    ...(Object.keys(LEVERS) as LeverKey[]).map((k) => ({ id: k, label: LEVERS[k].filterLabel })),
  ];

  return (
    <>
      <PageHeader eyebrow={`${showSample ? COMPANY.name : ws.workspaceName} · Week of ${longDate(TODAY)}`} title="Savings overview">
        <button type="button" className={btnGhost} onClick={() => setDigestOpen(true)}>
          <IconMail /> Preview weekly digest
        </button>
        <Link href="/upload" className={btnPrimary}>
          <IconUpload /> Upload contract
        </Link>
      </PageHeader>

      <SampleDataNote />
      <TeamSetupBanner />

      <section aria-label="Key numbers" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className="flex flex-col gap-2 rounded-[14px] bg-navy p-5 text-left text-white"
        >
          <span className="text-[13px] font-medium text-navy-text">Identified savings</span>
          <span className="font-display text-4xl font-semibold tracking-tight">
            {usd(PORTFOLIO.identifiedSavings)}
            <span className="text-base font-medium text-navy-text"> /yr</span>
          </span>
          <span className="text-[13px] text-navy-text">
            {PORTFOLIO.opportunityCount} opportunities ·{" "}
            {showSample ? `${((PORTFOLIO.identifiedSavings / COMPANY.spendUnderManagement) * 100).toFixed(1)}% of spend` : "connect spend to compare"}
          </span>
        </button>
        <Kpi label="At stake in next 30 days" value={usd(atStake)} valueClass="text-warn">
          {(() => {
            const dates = Array.from(new Set([...deadlineDates, ...deadlines.filter((d) => daysUntil(d.actBy) <= 30).map((d) => d.actBy)])).sort();
            return `${dates.length} notice deadline${dates.length === 1 ? "" : "s"}${dates[0] ? ` · first in ${daysUntil(dates[0])} days` : ""}`;
          })()}
        </Kpi>
        {withUsage.length > 0 && (
          <Link href="/seats" className="block">
            <Kpi label="Seats nobody used" value={idleSeats.toLocaleString("en-US")} suffix={` of ${paidSeats.toLocaleString("en-US")}`}>
              {usd(idleCost)} /yr across {withUsage.length} app{withUsage.length === 1 ? "" : "s"} · from sign-ins
            </Kpi>
          </Link>
        )}
        <Kpi label="Captured this year" value={usd(captured)} valueClass="text-good">
          <div
            className="mb-2 h-2 overflow-hidden rounded bg-[#E6F4EC]"
            role="img"
            aria-label={`${capturedPct}% of identified savings captured`}
          >
            <div className="h-2 rounded bg-good" style={{ width: `${Math.min(100, capturedPct)}%` }} />
          </div>
          {capturedPct}% of identified · {PORTFOLIO.wins + OPPORTUNITIES.filter((o) => statusOf(o.id) === "won").length} wins
        </Kpi>
        <Link href="/contracts" className="block">
          <Kpi
            label="Contracts tracked"
            value={String(PORTFOLIO.contractsTracked)}
            suffix={showSample ? ` of ${COMPANY.appsDetected + saved.length} apps` : " uploaded"}
          >
            {showSample
              ? `${COMPANY.appsDetected - PORTFOLIO.contractsTracked + saved.length} apps have no contract on file`
              : "Connect spend to find apps with no contract"}
          </Kpi>
        </Link>
      </section>

      {banner && bannerContract && !bannerSnoozed && (
        <div className="flex flex-wrap items-center gap-3.5 rounded-xl border border-warn-line bg-warn-soft px-[18px] py-3.5">
          <IconClock className="text-warn" />
          <div className="flex-[1_1_320px] text-sm leading-snug text-[#7A2E0B]">
            <strong>
              {bannerContract.vendor} auto-renews in {daysUntil(banner.actBy)} days.
            </strong>{" "}
            Cancel or resize {banner.finding.match(/^\d+/)?.[0] ?? ""} inactive seats before{" "}
            <strong>{shortDate(banner.actBy)}</strong> or you are locked in for {bannerContract.renewalTermMonths} more
            months at {usd(banner.annualSavings)} extra.
            {urgent.length > 1 && ` +${urgent.length - 1} more this week.`}
          </div>
          <button type="button" className="min-h-11 px-3 text-sm font-semibold text-warn-text hover:underline" onClick={() => setBannerSnoozed(true)}>
            Snooze 24h
          </button>
          <Link href={`/contracts/${banner.contractId}`} className="inline-flex min-h-11 items-center rounded-[10px] bg-urgent px-4 text-sm font-semibold text-white hover:bg-[#A02A08]">
            Review now
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <Card label="Savings opportunities" className="flex min-w-0 flex-[999_1_560px] flex-col">
          <div className="flex flex-col gap-3.5 border-b border-line-soft px-5 pt-5 pb-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <H2>Savings opportunities</H2>
                <span className="text-[13px] text-muted">
                  {rows.length} shown · {usd(rowTotal)} per year
                </span>
              </div>
              <Segmented
                label="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "deadline", label: "Soonest deadline" },
                  { value: "value", label: "Biggest $" },
                ]}
              />
            </div>
            <div role="group" aria-label="Filter by lever" className="flex flex-wrap gap-2">
              {filterDefs.map((f) => {
                const on = filter === f.id;
                const count = f.id === "all" ? visible.length : visible.filter((o) => o.lever === f.id).length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(f.id)}
                    className={cx(
                      "min-h-9 rounded-full border px-3.5 text-[13px] font-semibold",
                      on ? "border-ink bg-ink text-white" : "border-[#D0D5DD] bg-white text-ink-2 hover:border-[#98A2B3]",
                    )}
                  >
                    {f.label} <span className="font-medium opacity-75">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-muted uppercase">
                  <th scope="col" className="px-5 py-3 font-semibold">Vendor &amp; finding</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Lever</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Savings / yr</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Act by</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <OppRow
                    key={o.id}
                    o={o}
                    status={statusOf(o.id)}
                    menuOpen={menuFor === o.id}
                    onMenu={() => setMenuFor(menuFor === o.id ? null : o.id)}
                    onSet={(s) => {
                      setStatus(o.id, s);
                      setMenuFor(null);
                    }}
                  />
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-muted">
                      {showSample
                        ? "No open opportunities in this view. Next renewal is Gong on Dec 28. We'll flag anything new in Monday's digest."
                        : "No savings opportunities yet. Upload a contract that auto-renews and its savings show up here."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-line-soft px-5 py-3.5 text-[13px] text-muted">
            <span>
              Showing {rows.length} of {PORTFOLIO.opportunityCount} · savings are annualized, based on your current
              contract terms
              {saved.length > 0 && " · amounts for uploaded contracts are estimates from the contract alone (hover for the basis)"}
            </span>
            <button type="button" onClick={reset} className="font-semibold text-brand hover:text-brand-dark">
              Reset demo
            </button>
          </div>
        </Card>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <Card label="Upcoming notice deadlines" className="flex flex-col gap-4 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <H2>Notice deadlines</H2>
              <span className="text-[13px] text-muted">Next 90 days</span>
            </div>
            {deadlines.length === 0 && (
              <p className="m-0 text-sm text-muted">No notice deadlines in the next 90 days.</p>
            )}
            {deadlines.map((d) => {
              const days = daysUntil(d.actBy);
              const c = CONTRACTS.find((x) => x.id === d.contractId)!;
              return (
                <Link key={d.contractId + d.actBy} href={`/contracts/${d.contractId}`} className="flex items-center gap-3.5 rounded-lg text-ink hover:bg-[#F8FAFC]">
                  <div className={cx("flex h-[52px] w-[52px] flex-none flex-col items-center justify-center gap-0.5 rounded-[10px]", urgencyClassFor(days))}>
                    <span className="text-[11px] font-bold tracking-wider uppercase">{shortDate(d.actBy).split(" ")[0]}</span>
                    <span className="font-display text-xl leading-none font-semibold">{shortDate(d.actBy).split(" ")[1]}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold">{d.vendor}</span>
                    <span className="text-[13px] text-muted">{c.deadlineLabel}</span>
                  </div>
                  {d.amount > 0 ? (
                    <span className="text-[13px] font-semibold whitespace-nowrap text-good">{usd(d.amount)}</span>
                  ) : (
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">Uploaded</span>
                  )}
                </Link>
              );
            })}
            <Link href="/calendar" className="text-[13px] font-semibold text-brand">
              Open renewal calendar
            </Link>
          </Card>

          <PriceHikesCard contracts={CONTRACTS} />

          {showSample && (
          <Card label="Savings by lever" className="flex flex-col gap-3.5 p-5">
            <H2>Where the money is</H2>
            {SAVINGS_BY_LEVER.map((l) => (
              <button
                key={l.label}
                type="button"
                disabled={!l.lever}
                onClick={() => l.lever && setFilter(l.lever)}
                className="flex flex-col gap-1.5 rounded text-left enabled:hover:opacity-80 disabled:cursor-default"
              >
                <div className="flex w-full justify-between gap-2 text-[13px]">
                  <span className="font-medium">{l.label}</span>
                  <span className="font-semibold">{usd(l.value)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-[5px] bg-line-soft" role="img" aria-label={`${l.label} ${usd(l.value)}`}>
                  <div className="h-2.5 rounded-[5px] bg-brand" style={{ width: `${Math.round((l.value / maxLever) * 100)}%` }} />
                </div>
              </button>
            ))}
          </Card>
          )}

          <button
            type="button"
            onClick={() => setDigestOpen(true)}
            className="flex flex-col gap-2 rounded-[14px] border border-brand-line bg-brand-soft p-5 text-left hover:bg-[#E0E7FF]"
          >
            <span className="text-xs font-bold tracking-wider text-brand-dark">MONDAY DIGEST · 8:00 AM</span>
            <span className="text-sm leading-normal text-[#1E2A4A]">
              {showSample
                ? `Next digest goes to you and ${COMPANY.digestRecipients.length} others: 3 new findings, 4 deadlines this month, and the Salesforce pushback draft ready to send.`
                : `Every Monday: new findings and the notice deadlines coming up for ${ws.workspaceName}.`}
            </span>
          </button>
        </div>
      </div>

      {digestOpen && <DigestModal onClose={() => setDigestOpen(false)} opportunities={open} />}
    </>
  );
}

function Kpi({
  label,
  value,
  suffix,
  valueClass,
  children,
}: {
  label: string;
  value: string;
  suffix?: string;
  valueClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-[14px] border border-line bg-white p-5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <span className={cx("font-display text-4xl font-semibold tracking-tight", valueClass)}>
        {value}
        {suffix && <span className="text-base font-medium text-muted">{suffix}</span>}
      </span>
      <span className="text-[13px] text-muted">{children}</span>
    </div>
  );
}

function OppRow({
  o,
  status,
  menuOpen,
  onMenu,
  onSet,
}: {
  o: Opportunity;
  status: OppStatus;
  menuOpen: boolean;
  onMenu: () => void;
  onSet: (s: OppStatus) => void;
}) {
  const days = daysUntil(o.actBy);
  const done = status === "won";
  return (
    <tr className={cx("border-t border-line-soft hover:bg-[#F8FAFC]", done && "opacity-60")}>
      <td className="min-w-[280px] px-5 py-3.5">
        <Link href={`/contracts/${o.contractId}`} className="flex items-center gap-3 text-ink">
          <VendorLogo initials={o.initials} hue={o.hue} />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">
              {o.vendor}
              {STATUS_LABEL[status] && (
                <span className="ml-2 rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good-dark">
                  {STATUS_LABEL[status]}
                </span>
              )}
            </span>
            <span className="text-[13px] text-muted">{o.finding}</span>
          </div>
        </Link>
      </td>
      <td className="px-3 py-3.5 whitespace-nowrap">
        <span className={cx("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", LEVERS[o.lever].className)}>
          {LEVERS[o.lever].label}
        </span>
      </td>
      <td className="px-3 py-3.5 text-right whitespace-nowrap">
        {o.annualSavings > 0 ? (
          <span className="font-display text-base font-semibold text-good" title={"basis" in o ? String(o.basis) : undefined}>
            {o.estimate ? "up to " : ""}
            {usd(o.annualSavings)}
          </span>
        ) : (
          <span className="text-[13px] text-muted" title={"basis" in o ? String(o.basis) : undefined}>Fee not in contract</span>
        )}
      </td>
      <td className="px-3 py-3.5 whitespace-nowrap">
        {o.actBy ? (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{shortDate(o.actBy)}</span>
            <DaysBadge days={days} />
          </div>
        ) : (
          <span className="text-[13px] text-muted">Date not found</span>
        )}
      </td>
      <td className="relative px-5 py-3.5 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1">
          <Link href={`/contracts/${o.contractId}`} className={btnSoft}>
            {o.action}
          </Link>
          <button
            type="button"
            aria-label={`More actions for ${o.vendor}`}
            aria-expanded={menuOpen}
            onClick={onMenu}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-chip"
          >
            <IconMore />
          </button>
        </div>
        {menuOpen && (
          <div className="absolute top-14 right-5 z-10 flex w-52 flex-col rounded-xl border border-line bg-white p-1.5 text-left shadow-lg">
            {[
              { s: "won" as const, label: "Mark as won" },
              { s: "in_progress" as const, label: "Mark in progress" },
              { s: "snoozed" as const, label: "Snooze for a week" },
              { s: "dismissed" as const, label: "Dismiss (not relevant)" },
              { s: "open" as const, label: "Reopen" },
            ].map((m) => (
              <button key={m.s} type="button" onClick={() => onSet(m.s)} className="min-h-10 rounded-lg px-3 text-left text-sm hover:bg-chip">
                {m.label}
              </button>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
