"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePortfolio } from "@/lib/portfolio";
import { SampleDataNote } from "@/components/SampleDataNote";
import { addDays, daysUntil, noticeDeadline, parseISO, renewalDate, TODAY } from "@/lib/engine";
import { longDate, monthKey, shortDate, usd } from "@/lib/format";
import { buildIcs } from "@/lib/ics";
import { IconMail } from "@/components/icons";
import { btnGhost, Card, cx, DaysBadge, H2, PageHeader, Segmented, urgencyClassFor, VendorLogo } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceProvider";
import type { Contract } from "@/lib/types";

// Reminder emails go out this many days before each date (matches the default RENEWAL_ALERT_DAYS on the server).
const REMINDER_DAYS = [90, 60, 30];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Event = { date: string; contract: Contract; kind: "notice" | "renewal"; label: string; amount: number };

const monthStart = (iso: string) => iso.slice(0, 8) + "01";
const shiftMonth = (iso: string, n: number) => {
  const d = parseISO(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

export default function CalendarPage() {
  const { contracts, opportunities, loading } = usePortfolio();
  const ws = useWorkspace();
  const [view, setView] = useState<"month" | "list">("month");
  const [month, setMonth] = useState(monthStart(TODAY));
  const [picked, setPicked] = useState<string | null>(null);

  const all: Event[] = useMemo(
    () =>
      contracts
        .filter((c) => noticeDeadline(c) && c.termEnd)
        .flatMap((c) => {
          const atStake = opportunities.filter((o) => o.contractId === c.id).reduce((s, o) => s + o.annualSavings, 0);
          return [
            { date: noticeDeadline(c), contract: c, kind: "notice" as const, label: `Last day to give notice · ${c.deadlineLabel}`, amount: atStake },
            {
              date: renewalDate(c),
              contract: c,
              kind: "renewal" as const,
              label: c.autoRenew
                ? `Renews for ${c.renewalTermMonths} months${c.annualFee ? ` at ${usd(c.quote?.annualFee ?? c.annualFee)}` : ""}`
                : "Term ends",
              amount: 0,
            },
          ];
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    [contracts, opportunities],
  );
  const upcoming = all.filter((e) => daysUntil(e.date) >= 0);
  const byDay = useMemo(
    () =>
      all.reduce<Record<string, Event[]>>((acc, e) => {
        (acc[e.date] ??= []).push(e);
        return acc;
      }, {}),
    [all],
  );

  function downloadIcs() {
    const origin = window.location.origin;
    const ics = buildIcs(
      upcoming.map((e) => ({
        uid: `${e.contract.id}-${e.kind}-${e.date}@contract-radar`,
        date: e.date,
        title: `${e.kind === "notice" ? "Notice deadline" : e.contract.autoRenew ? "Renews" : "Term ends"}: ${e.contract.vendor}${e.contract.product ? ` ${e.contract.product}` : ""}`,
        description: e.label,
        url: `${origin}/contracts/${e.contract.id}`,
      })),
      { name: `${ws.workspaceName} renewals`, reminderDays: REMINDER_DAYS },
    );
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "contract-renewals.ics" });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <PageHeader eyebrow="Every notice and renewal date we found in your contracts" title="Renewal calendar">
        <Segmented
          label="Calendar view"
          value={view}
          onChange={setView}
          options={[
            { value: "month", label: "Month" },
            { value: "list", label: "List" },
          ]}
        />
        <button type="button" className={btnGhost} onClick={downloadIcs} disabled={!upcoming.length}>
          Add to my calendar (.ics)
        </button>
      </PageHeader>
      <SampleDataNote />

      <div className="flex items-start gap-3 rounded-xl border border-brand-line bg-brand-soft px-4 py-3 text-[13px] text-ink-2">
        <IconMail size={18} className="mt-0.5 flex-none text-brand" />
        <span>
          {ws.mode === "demo" ? "In a shared workspace, email reminders go to" : "Email reminders go to"} the department owner and the workspace admins {REMINDER_DAYS.join(", ").replace(/, (\d+)$/, " and $1")} days
          before each date.{" "}
          <Link href="/settings" className="font-semibold text-brand">Reminder settings</Link>
        </span>
      </div>

      {!loading && all.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted">
          No dates yet. <Link href="/upload" className="font-semibold text-brand">Upload a contract</Link> to add its notice and renewal dates.
        </Card>
      )}

      {all.length > 0 && view === "month" && (
        <MonthGrid
          month={month}
          byDay={byDay}
          picked={picked}
          onPick={(d) => setPicked(d === picked ? null : d)}
          onMonth={(n) => {
            setMonth(shiftMonth(month, n));
            setPicked(null);
          }}
        />
      )}

      {all.length > 0 && view === "month" && (
        <Card label="Dates this month" className="flex flex-col gap-3 p-5">
          <H2>{picked ? longDate(picked) : `${monthKey(month)}`}</H2>
          {(() => {
            const list = picked ? (byDay[picked] ?? []) : all.filter((e) => e.date.startsWith(month.slice(0, 7)));
            return list.length ? (
              list.map((e) => <EventRow key={e.contract.id + e.kind} e={e} />)
            ) : (
              <span className="text-sm text-muted">{picked ? "Nothing on this day." : "Nothing due this month."}</span>
            );
          })()}
        </Card>
      )}

      {view === "list" &&
        Object.entries(
          upcoming.reduce<Record<string, Event[]>>((acc, e) => {
            (acc[monthKey(e.date)] ??= []).push(e);
            return acc;
          }, {}),
        ).map(([m, list]) => (
          <Card key={m} label={m} className="flex flex-col gap-3 p-5">
            <H2>{m}</H2>
            {list.map((e) => (
              <EventRow key={e.contract.id + e.kind} e={e} />
            ))}
          </Card>
        ))}
    </>
  );
}

function MonthGrid({
  month,
  byDay,
  picked,
  onPick,
  onMonth,
}: {
  month: string;
  byDay: Record<string, Event[]>;
  picked: string | null;
  onPick: (d: string) => void;
  onMonth: (n: number) => void;
}) {
  const first = parseISO(month);
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const start = addDays(month, -lead);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = cells.slice(35).some((d) => d.startsWith(month.slice(0, 7))) ? 6 : 5;

  return (
    <Card label="Month view" className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <H2>{monthKey(month)}</H2>
        <div className="flex gap-1.5">
          <button type="button" aria-label="Previous month" className={cx(btnGhost, "min-w-11 px-0")} onClick={() => onMonth(-1)}>
            &lsaquo;
          </button>
          <button type="button" aria-label="Next month" className={cx(btnGhost, "min-w-11 px-0")} onClick={() => onMonth(1)}>
            &rsaquo;
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[10px] border border-line bg-line">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-[#F8FAFC] px-1.5 py-2 text-center text-[11px] font-bold tracking-wider text-muted uppercase">
            {w}
          </div>
        ))}
        {cells.slice(0, rows * 7).map((d) => {
          const inMonth = d.startsWith(month.slice(0, 7));
          const events = byDay[d] ?? [];
          const isToday = d === TODAY;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-label={`${longDate(d)}${events.length ? `, ${events.length} date${events.length > 1 ? "s" : ""}` : ""}`}
              className={cx(
                "flex min-h-[64px] flex-col gap-1 bg-white p-1.5 text-left align-top sm:min-h-[96px] sm:p-2",
                !inMonth && "bg-[#FAFBFC] text-[#98A2B3]",
                picked === d && "ring-2 ring-brand ring-inset",
              )}
            >
              <span
                className={cx(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold",
                  isToday && "bg-brand text-white",
                )}
              >
                {parseISO(d).getUTCDate()}
              </span>
              {/* Phone: dots. Wider: vendor chips. */}
              <span className="flex flex-wrap gap-1 sm:hidden">
                {events.map((e) => (
                  <span key={e.contract.id + e.kind} className={cx("h-2 w-2 rounded-full", e.kind === "notice" ? "bg-warn" : "bg-brand")} />
                ))}
              </span>
              <span className="hidden flex-col gap-1 sm:flex">
                {events.slice(0, 3).map((e) => (
                  <span
                    key={e.contract.id + e.kind}
                    className={cx(
                      "truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-semibold",
                      e.kind === "notice" ? urgencyClassFor(daysUntil(e.date)) : "bg-brand-soft text-brand-dark",
                    )}
                    title={`${e.contract.vendor}: ${e.label}`}
                  >
                    {e.kind === "notice" ? "Notice: " : ""}
                    {e.contract.vendor}
                  </span>
                ))}
                {events.length > 3 && <span className="text-[11px] text-muted">+{events.length - 3} more</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warn" /> Notice deadline</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> Renewal or term end</span>
      </div>
    </Card>
  );
}

function EventRow({ e }: { e: Event }) {
  const c = e.contract;
  const days = daysUntil(e.date);
  const reminders = REMINDER_DAYS.map((n) => addDays(e.date, -n)).filter((d) => daysUntil(d) >= 0);
  return (
    <Link href={`/contracts/${c.id}`} className="flex items-center gap-3.5 rounded-lg py-1 text-ink hover:bg-[#F8FAFC]">
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
        {days >= 0 && reminders.length > 0 && (
          <span className="text-[12px] text-muted">Reminder emails: {reminders.map(shortDate).join(", ")}</span>
        )}
      </div>
      <div className="flex flex-none flex-col items-end gap-1">
        <DaysBadge days={days} />
        {e.amount > 0 && <span className="text-[13px] font-semibold text-good">{usd(e.amount)} at stake</span>}
      </div>
    </Link>
  );
}
