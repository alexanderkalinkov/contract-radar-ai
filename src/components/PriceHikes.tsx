"use client";

// Price-hike views shared by the dashboard, the Price changes page and the contract pages.
import Link from "next/link";
import { daysUntil } from "@/lib/engine";
import { longDate, shortDate, usd } from "@/lib/format";
import { escalatorIncrease, hikeVerdict, priceChangeFor, signedPct } from "@/lib/price-history";
import type { Contract, PriceChange } from "@/lib/types";
import { Card, cx, H2, VendorLogo } from "./ui";

export interface HikeRow {
  contract: Contract;
  change: PriceChange | null;
  escalator: { pct: number; amount: number } | null;
}

/** Contracts whose renewal price went up, or will go up on its own, biggest problem first. */
export function priceHikeRows(contracts: Contract[]): HikeRow[] {
  const rows: HikeRow[] = [];
  for (const c of contracts) {
    const change = priceChangeFor(c);
    const escalator = !change ? escalatorIncrease(c) : null;
    if ((change && change.deltaAbs > 0) || escalator) rows.push({ contract: c, change: change && change.deltaAbs > 0 ? change : null, escalator });
  }
  const weight = (r: HikeRow) => (r.change ? r.change.overCap * 10 + r.change.deltaAbs : r.escalator!.amount / 2);
  return rows.sort((a, b) => weight(b) - weight(a));
}

export function VerdictBadge({ change }: { change: PriceChange }) {
  const v = hikeVerdict(change);
  const [cls, text] =
    v === "over_cap"
      ? ["bg-warn-soft text-warn-text", `${usd(change.overCap)} over cap`]
      : v === "no_cap"
        ? ["bg-[#FEE4E2] text-[#912018]", "No cap"]
        : v === "within_cap"
          ? ["bg-good-soft text-good-dark", "Within cap"]
          : ["bg-chip text-ink-2", "No increase"];
  return <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", cls)}>{text}</span>;
}

/** One line per hike: vendor, old → new, percent and money, verdict against the cap. */
export function HikeList({ rows, compact }: { rows: HikeRow[]; compact?: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map(({ contract: c, change, escalator }) => (
        <li key={c.id}>
          <Link
            href={`/contracts/${c.id}`}
            className={cx(
              "flex flex-wrap items-center gap-3 rounded-xl text-ink hover:bg-[#F8FAFC]",
              compact ? "py-1" : "border border-line-soft px-4 py-3",
            )}
          >
            <VendorLogo initials={c.initials} hue={c.hue} size={compact ? 32 : 36} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold">
                {c.vendor}
                {!compact && c.product ? ` ${c.product}` : ""}
              </span>
              {change ? (
                <span className="text-[13px] text-muted">
                  {!compact && (change.source === "quote" ? "Quote " : "Renewed ")}
                  {usd(change.previousFee)} → {usd(change.newFee)}{" "}
                  <span className="font-semibold whitespace-nowrap text-warn">
                    {signedPct(change.deltaPct)}
                    {!compact && ` (${usd(change.deltaAbs)})`}
                  </span>
                  {!compact && change.perSeatPct != null && change.perSeatPct !== change.deltaPct && (
                    <> · per seat {signedPct(change.perSeatPct)}</>
                  )}
                  {!compact && <> · {change.capPct != null ? `cap ${change.capPct}%` : "no cap"} · received {shortDate(change.receivedOn)}</>}
                </span>
              ) : (
                <span className="text-[13px] text-muted">
                  Built-in increase: <span className="font-semibold text-warn">+{escalator!.pct}%</span> ({usd(escalator!.amount)}) next term
                </span>
              )}
            </div>
            {change ? (
              <VerdictBadge change={change} />
            ) : (
              <span className="rounded-full bg-chip px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-ink-2">Auto-escalator</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Dashboard card: the price hikes that need a decision. */
export function PriceHikesCard({ contracts }: { contracts: Contract[] }) {
  const rows = priceHikeRows(contracts);
  const overCap = rows.reduce((s, r) => s + (r.change?.overCap ?? 0), 0);
  const increase = rows.reduce((s, r) => s + (r.change?.deltaAbs ?? r.escalator?.amount ?? 0), 0);
  return (
    <Card label="Price hikes" className="flex flex-col gap-3.5 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <H2>Price hikes</H2>
        {rows.length > 0 && <span className="text-[13px] text-muted">+{usd(increase)}/yr</span>}
      </div>
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-muted">
          No increases found. Upload a vendor&apos;s renewal quote and we&apos;ll compare it with the current contract.
        </p>
      ) : (
        <>
          {overCap > 0 && (
            <p className="m-0 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn-text">
              <strong>{usd(overCap)}</strong> a year is above what your contracts allow.
            </p>
          )}
          <HikeList rows={rows.slice(0, 4)} compact />
        </>
      )}
      <Link href="/price-changes" className="text-[13px] font-semibold text-brand">
        See all price changes
      </Link>
    </Card>
  );
}

/** Contract page: the renewal price against the one before it, and what the contract says about increases. */
export function PriceChangePanel({
  change,
  escalators,
  timeline,
}: {
  change: PriceChange | null;
  escalators: Contract["escalators"];
  timeline?: { id: string; doc: string; fee: number | null; date: string; kind: string; current: boolean }[];
}) {
  const esc = escalators ?? [];
  if (!change && !esc.length) return null;
  const v = change ? hikeVerdict(change) : null;
  const days = change?.actBy ? daysUntil(change.actBy) : null;
  return (
    <Card label="Price change" className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2>Price change</H2>
        {change && <VerdictBadge change={change} />}
      </div>
      {change && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <Stat label={change.source === "quote" ? "Current term" : "Previous term"} value={usd(change.previousFee)} sub={change.previousDoc} />
            <Stat label={change.source === "quote" ? "Renewal quote" : "Renewed at"} value={usd(change.newFee)} sub={change.newDoc} />
            <Stat
              label="Increase"
              value={`${signedPct(change.deltaPct)}`}
              sub={`${change.deltaAbs >= 0 ? "+" : "−"}${usd(Math.abs(change.deltaAbs))} a year`}
              tone={change.deltaAbs > 0 ? "warn" : "good"}
            />
            {change.perSeatPrevious != null && change.perSeatNew != null && (
              <Stat
                label="Per seat, per year"
                value={`${usd(change.perSeatPrevious)} → ${usd(change.perSeatNew)}`}
                sub={`${change.previousSeats} → ${change.newSeats} seats${change.perSeatPct != null ? ` · ${signedPct(change.perSeatPct)}` : ""}`}
              />
            )}
          </div>
          <p
            className={cx(
              "m-0 rounded-lg px-3 py-2 text-[13px]",
              v === "over_cap" || v === "no_cap" ? "bg-warn-soft text-warn-text" : "bg-good-soft text-good-dark",
            )}
          >
            {v === "over_cap" && (
              <>
                The {change.capPct}% cap in {change.previousDoc} allows at most <strong>{usd(change.cappedFee!)}</strong>.{" "}
                {change.source === "quote" ? "Push back on" : "Ask for a credit of"} <strong>{usd(change.overCap)}</strong> a year
                {change.source === "quote" && change.actBy ? ` before the notice deadline, ${longDate(change.actBy)}${days != null && days >= 0 ? ` (${days} days)` : ""}` : ""}.
              </>
            )}
            {v === "no_cap" && (
              <>
                The contract doesn&apos;t limit renewal increases, so the vendor can ask for this.{" "}
                {change.source === "quote"
                  ? `Negotiate it down and ask for a cap before the notice deadline${change.actBy ? `, ${longDate(change.actBy)}` : ""}.`
                  : "Ask for a cap before the next renewal."}
              </>
            )}
            {v === "within_cap" && <>Within the {change.capPct}% cap in {change.previousDoc}. You can still ask them to hold the price.</>}
            {v === "flat_or_down" && <>The price didn&apos;t go up.</>}
          </p>
        </>
      )}
      {esc.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Built-in price increases in the contract</span>
          {esc.map((e) => (
            <div key={e.description} className="flex flex-col gap-1 rounded-lg border border-line-soft px-3 py-2">
              <span className="text-sm font-semibold">{e.description}</span>
              {e.quote && (
                <span className="text-[13px] text-muted">
                  &ldquo;{e.quote}&rdquo;{e.page ? ` · page ${e.page}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {timeline && timeline.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-2">Price history</span>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {timeline.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className={cx(t.current ? "font-semibold" : "text-muted")}>
                  {t.current ? (
                    t.doc
                  ) : (
                    <Link href={`/contracts/${t.id}`} className="text-brand">
                      {t.doc}
                    </Link>
                  )}{" "}
                  <span className="text-muted">· {t.kind} · from {longDate(t.date)}</span>
                </span>
                <span className="font-semibold">{t.fee != null ? `${usd(t.fee)}/yr` : "No fee found"}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "good" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-[#F8FAFC] px-3 py-2.5">
      <span className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</span>
      <span className={cx("font-display text-lg font-semibold", tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-ink")}>{value}</span>
      {sub && <span className="truncate text-xs text-muted" title={sub}>{sub}</span>}
    </div>
  );
}
