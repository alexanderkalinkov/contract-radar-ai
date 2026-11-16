"use client";

import { useState } from "react";
import type { SeatUsage } from "@/lib/types";
import { activeLabel, sinceLabel } from "@/lib/usage";
import { Card, cx, H2 } from "./ui";

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("h-2.5 w-2.5 rounded-[3px]", color)} />
      {label}
    </span>
  );
}

const pct = (n: number, of: number) => `${of ? (n / of) * 100 : 0}%`;

/** Active / inactive / no sign-in, as one stacked bar. */
export function UsageBar({ u, tall }: { u: SeatUsage; tall?: boolean }) {
  return (
    <div
      className={cx("flex overflow-hidden rounded-md bg-chip", tall ? "h-3.5" : "h-3")}
      role="img"
      aria-label={`${u.active} active, ${u.inactive} inactive, ${u.neverSignedIn} ${neverLabel(u)}`}
    >
      <div className="bg-brand" style={{ width: pct(u.active, u.paid) }} />
      <div className="bg-[#F79009]" style={{ width: pct(u.inactive, u.paid) }} />
      <div className="bg-[#7A2E0B]" style={{ width: pct(u.neverSignedIn, u.paid) }} />
    </div>
  );
}

export const neverLabel = (u: SeatUsage) => (u.windowDays ? `no sign-in in ${u.windowDays} days` : "never signed in");

export function usageLegend(u: SeatUsage) {
  return [
    { color: "bg-brand", label: `${u.active} active`, show: true },
    // A 30-day source (Microsoft) can't tell "inactive" from "no sign-in": skip the empty bucket.
    { color: "bg-[#F79009]", label: `${u.inactive} inactive ${activeLabel(u).replace(" days", "")}+ days`, show: u.inactive > 0 || (u.windowDays ?? 999) > (u.activeDays ?? 60) },
    { color: "bg-[#7A2E0B]", label: `${u.neverSignedIn} ${neverLabel(u)}`, show: true },
  ]
    .filter((l) => l.show)
    .map(({ color, label }) => ({ color, label }));
}

/** The seat usage card on a contract page, with who to reclaim seats from when the source names them. */
export function SeatUsageCard({ u }: { u: SeatUsage }) {
  const [showAll, setShowAll] = useState(false);
  const idle = u.idle ?? [];
  const shown = showAll ? idle : idle.slice(0, 6);
  return (
    <Card label="Seat usage" className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2>Seat usage</H2>
        <span className="text-[13px] text-muted">
          From {u.source} sign-ins{u.live ? "" : `, last ${activeLabel(u)}`}
          {u.lastLogin ? ` · latest sign-in ${sinceLabel(u.lastLogin)}` : ""}
        </span>
      </div>
      <UsageBar u={u} tall />
      <div className="flex flex-wrap gap-[18px] text-[13px] text-ink-2">
        {usageLegend(u).map((l) => (
          <Legend key={l.label} {...l} />
        ))}
        <span className="text-muted">of {u.paid} paid</span>
      </div>
      {idle.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
          <span className="text-[13px] font-semibold text-ink-2">Seats to reclaim first</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {shown.map((p) => (
              <li key={p.email} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{p.email}</span>
                <span className="shrink-0 text-muted">{p.last ? `last ${sinceLabel(p.last)}` : neverLabel(u)}</span>
              </li>
            ))}
          </ul>
          {idle.length > shown.length && (
            <button type="button" className="self-start text-[13px] font-semibold text-brand" onClick={() => setShowAll(true)}>
              Show all {idle.length}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
