"use client";

import Link from "next/link";
import { useState } from "react";
import { COMPANY, OPPORTUNITIES } from "@/lib/seed";
import { addDays, daysUntil, noticeDeadline, pushbackEmail, renewalDate, renewalMath, TODAY, type Tone } from "@/lib/engine";
import { longDate, shortDate, usd } from "@/lib/format";
import { useOppStatus } from "@/lib/store";
import type { Contract } from "@/lib/types";
import { IconCheck } from "./icons";
import { PriceChangePanel } from "./PriceHikes";
import { priceChangeFor } from "@/lib/price-history";
import { btnGhost, btnPrimary, Card, ConfidenceTag, cx, H2, Segmented, VendorLogo } from "./ui";
import { SeatUsageCard } from "./SeatUsage";
import { RenewalDecisionCard } from "./RenewalDecision";

export function ContractDetail({ contract: c }: { contract: Contract }) {
  const m = renewalMath(c);
  const notice = noticeDeadline(c);
  const renews = renewalDate(c);
  const days = daysUntil(notice);
  const opps = OPPORTUNITIES.filter((o) => o.contractId === c.id);
  const { statusOf, setStatus } = useOppStatus();
  const sent = opps.length > 0 && opps.every((o) => statusOf(o.id) === "in_progress");

  const hasSeatCut = m.removableSeats > 0 && c.usage != null;
  const hasCap = m.capSavings > 0;
  const [ask, setAsk] = useState<"cap" | "both">(hasSeatCut ? "both" : "cap");
  const [tone, setTone] = useState<Tone>("firm");
  const [copied, setCopied] = useState(false);

  const cons = c.consolidation;
  const includeSeats = !cons && hasSeatCut && (ask === "both" || !hasCap);
  const email = pushbackEmail(c, { tone, includeSeats, company: COMPANY.name, signer: COMPANY.signer });
  const savings = cons
    ? c.annualFee - cons.extraCost
    : (hasCap ? m.capSavings : 0) + (includeSeats ? m.seatSavings : 0);

  // Timeline: from quote received (or 3 weeks ago) to the renewal date.
  const start = c.quote?.receivedOn ?? addDays(TODAY, -21);
  const span = daysUntil(renews, start);
  const pos = (iso: string) => `${Math.max(0, Math.min(100, (daysUntil(iso, start) / span) * 100))}%`;

  const mailto = `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <Link href="/" className="font-medium text-brand">Savings</Link>
        <span aria-hidden="true">/</span>
        <Link href="/contracts" className="font-medium text-brand">Contracts</Link>
        <span aria-hidden="true">/</span>
        <span>{c.vendor} {c.product}</span>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <VendorLogo initials={c.initials} hue={c.hue} size={56} />
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 font-display text-[28px] font-semibold tracking-tight">
              {c.vendor} {c.product}
            </h1>
            <div className="flex flex-wrap gap-2 text-[13px]">
              {c.quote && (
                <span className="rounded-full bg-warn-soft px-2.5 py-1 font-semibold text-warn-text">
                  Renewal quote received {shortDate(c.quote.receivedOn)}
                </span>
              )}
              <span className="rounded-full bg-chip px-2.5 py-1 font-semibold text-ink-2">Owner: {c.owner}</span>
              <span className="rounded-full bg-chip px-2.5 py-1 font-semibold text-ink-2">{c.documents.join(" + ")}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 rounded-xl border border-line bg-white px-[18px] py-3">
          <span className="text-xs font-semibold tracking-wide text-muted">NOTICE DEADLINE</span>
          <span className={cx("font-display text-[22px] font-semibold", days <= 30 ? "text-warn" : "text-ink")}>
            {longDate(notice)} · {days} days
          </span>
        </div>
      </header>

      <Card label="Renewal timeline" className="flex flex-col gap-3.5 px-6 py-5">
        <div className="relative h-3 rounded-md bg-line-soft">
          <div className="absolute top-0 left-0 h-3 rounded-md bg-brand" style={{ width: pos(TODAY) }} />
          <div className="absolute -top-1.5 h-6 w-1 rounded-sm bg-ink" style={{ left: pos(TODAY) }} aria-hidden="true" />
          <div className="absolute -top-1.5 h-6 w-1 rounded-sm bg-urgent" style={{ left: pos(notice) }} aria-hidden="true" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          <TimelineLabel label={c.quote ? "Quote received" : "Tracking since"} value={shortDate(start)} />
          <TimelineLabel label="Today" value={shortDate(TODAY)} />
          <TimelineLabel label="Last day to give notice" value={shortDate(notice)} strong />
          <TimelineLabel
            label={c.autoRenew ? `Auto-renews for ${c.renewalTermMonths} months` : "Term ends"}
            value={longDate(renews)}
            right
          />
        </div>
      </Card>

      <RenewalDecisionCard contract={c} opportunities={opps} />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-6">
          <Card label="Renewal math" className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <H2>Renewal math</H2>
              <span className="text-[13px] text-muted">
                {c.seats} seats · {usd(c.annualFee / c.seats / 12)} per seat / month today
              </span>
            </div>
            {cons ? (
              <div className="flex flex-col text-sm">
                <MathRow label="Current annual fee (retire at renewal)" value={usd(c.annualFee)} />
                <MathRow label={`Add ${cons.movedUsers} seats on ${cons.keepVendor}`} value={"−" + usd(cons.extraCost)} />
              </div>
            ) : (
            <div className="flex flex-col text-sm">
              <MathRow label="Current annual fee" value={usd(m.currentFee)} />
              {m.quotedFee != null && (
                <MathRow
                  label={<>Vendor quote <span className="font-semibold text-warn">(+{m.quoteIncreasePct}%)</span></>}
                  value={usd(m.quotedFee)}
                />
              )}
              {m.cappedFee != null && m.quotedFee != null && (
                <MathRow
                  label={<>Maximum allowed by {c.clauses.find((x) => /pric/i.test(x.title))?.ref ?? "contract"} <span className="text-muted">(+{c.upliftCapPct}% cap)</span></>}
                  value={usd(m.cappedFee)}
                />
              )}
              {hasSeatCut && (
                <MathRow
                  label={`Right-sized to ${m.rightSizedSeats} active seats${m.cappedFee != null && m.quotedFee != null ? " at capped price" : ""}`}
                  value={usd(m.rightSizedFee)}
                />
              )}
            </div>
            )}
            {!cons && hasCap && hasSeatCut && (
              <div className="flex flex-col gap-2.5">
                <span className="text-[13px] font-semibold text-ink-2">What to ask for</span>
                <div role="group" aria-label="What to ask for" className="flex flex-wrap gap-2">
                  {[
                    { v: "cap" as const, label: `Enforce ${c.upliftCapPct}% cap` },
                    { v: "both" as const, label: `Cap + cut ${m.removableSeats} seats` },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      aria-pressed={ask === o.v}
                      onClick={() => setAsk(o.v)}
                      className={cx(
                        "min-h-10 rounded-full border px-4 text-[13px] font-semibold",
                        ask === o.v ? "border-brand bg-brand-soft text-brand-dark" : "border-[#D0D5DD] bg-white text-ink-2",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-good-soft p-4">
              <div className="flex flex-col gap-0.5 text-[13px] text-good-dark">
                <span className="font-semibold">Savings vs. {c.quote ? "vendor quote" : "auto-renewal"}</span>
                <span>
                  {cons
                    ? `Cancel ${c.vendor}, move ${cons.movedUsers} users to ${cons.keepVendor}`
                    : hasCap && includeSeats
                    ? `${usd(m.capSavings)} from the cap + ${usd(m.seatSavings)} from ${m.removableSeats} seats`
                    : hasCap
                      ? `Quote brought back to the ${c.upliftCapPct}% cap`
                      : includeSeats
                        ? `${m.removableSeats} unused seats removed at renewal`
                        : "No savings modelled yet"}
                </span>
              </div>
              <span className="font-display text-[30px] font-semibold text-good-dark">{usd(savings)}</span>
            </div>
          </Card>

          <PriceChangePanel change={priceChangeFor(c)} escalators={c.escalators} />

          <Card label="Clauses found by AI" className="flex flex-col gap-3.5 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <H2>Clauses that matter</H2>
              <span className="text-[13px] text-muted">
                Extracted from {c.documents.length} document{c.documents.length > 1 ? "s" : ""}, {c.pages} pages
              </span>
            </div>
            {c.clauses.length === 0 && <p className="m-0 text-sm text-muted">No clauses extracted yet.</p>}
            {c.clauses.map((cl) => (
              <div key={cl.ref} className="flex flex-col gap-2 rounded-xl border border-line-soft px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {cl.ref} {cl.title}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {cl.document}, page {cl.page} <ConfidenceTag level={cl.confidence} />
                  </span>
                </div>
                <blockquote className="m-0 rounded-lg bg-[#F8FAFC] px-3 py-2.5 font-serif text-[13px] leading-relaxed text-ink-2">
                  &ldquo;{cl.quote}&rdquo;
                </blockquote>
                <span className="text-[13px] font-medium text-brand-dark">{cl.meaning}</span>
              </div>
            ))}
          </Card>

          {c.usage && <SeatUsageCard u={c.usage} />}
        </div>

        <div id="pushback-email" className="flex min-w-0 flex-[1_1_440px] scroll-mt-6 flex-col">
        <Card label="Pushback email draft" className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-[18px]">
            <div className="flex flex-col gap-0.5">
              <H2>{c.quote ? "Pushback email" : "Renewal notice email"}</H2>
              <span className="text-[13px] text-muted">Drafted by Outflow, cites your contract</span>
            </div>
            <Segmented
              label="Tone"
              value={tone}
              onChange={setTone}
              options={[
                { value: "firm", label: "Firm" },
                { value: "friendly", label: "Friendly" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2.5 border-b border-line-soft px-5 py-4 text-sm">
            <div className="flex gap-2.5"><span className="w-16 flex-none text-muted">To</span><span>[{c.vendor} account executive]</span></div>
            <div className="flex gap-2.5"><span className="w-16 flex-none text-muted">Cc</span><span>{c.owner.split("·")[1]?.trim() ?? c.owner}, Finance</span></div>
            <div className="flex gap-2.5"><span className="w-16 flex-none text-muted">Subject</span><span className="font-semibold">{email.subject}</span></div>
          </div>
          <div className="px-5 py-[18px] text-sm leading-relaxed whitespace-pre-line text-[#1D2939]">{email.body}</div>
          <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft px-5 py-4">
            {!sent ? (
              <>
                <a
                  href={mailto}
                  className={btnPrimary}
                  onClick={() => opps.forEach((o) => setStatus(o.id, "in_progress"))}
                >
                  Open in email and send
                </a>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      /* clipboard blocked */
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy text"}
                </button>
                <button type="button" className="min-h-11 px-2 text-sm font-semibold text-brand" onClick={() => opps.forEach((o) => setStatus(o.id, "in_progress"))}>
                  Mark as sent
                </button>
                <span className="text-[13px] text-muted">
                  We remind you on {shortDate(addDays(TODAY, 9))} if there is no reply.
                </span>
              </>
            ) : (
              <>
                <div className="flex flex-1 items-center gap-2.5 rounded-[10px] bg-good-soft px-3.5 py-2.5 text-sm font-semibold text-good-dark">
                  <IconCheck />
                  Sent {shortDate(TODAY)}. Tracking the reply, and the {shortDate(notice)} deadline stays on your radar.
                </div>
                <button type="button" className={btnGhost} onClick={() => opps.forEach((o) => setStatus(o.id, "open"))}>
                  Undo
                </button>
              </>
            )}
          </div>
        </Card>
        </div>
      </div>
    </>
  );
}

function TimelineLabel({ label, value, strong, right }: { label: string; value: string; strong?: boolean; right?: boolean }) {
  return (
    <div className={cx("flex flex-col gap-0.5", right && "sm:text-right")}>
      <span className={strong ? "font-semibold text-warn" : "text-muted"}>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function MathRow({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line-soft py-2.5">
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

