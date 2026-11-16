import type { Contract } from "./types";

const DAY = 24 * 60 * 60 * 1000;

/** Today's date (UTC), YYYY-MM-DD. */
export const TODAY = new Date().toISOString().slice(0, 10);

/** The day the sample data was written for. Sample dates are shifted by the same number of days, so they never go stale. */
const SAMPLE_ANCHOR = "2026-11-15";
const SAMPLE_SHIFT = Math.round((Date.parse(TODAY) - Date.parse(SAMPLE_ANCHOR)) / DAY);

/** A sample-data date, moved forward so it stays as far from today as it was from the anchor day. */
export function sampleDate(iso: string): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + SAMPLE_SHIFT * DAY).toISOString().slice(0, 10);
}

export function parseISO(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toISO(new Date(parseISO(iso).getTime() + days * DAY));
}

export function daysUntil(iso: string, from: string = TODAY): number {
  return Math.round((parseISO(iso).getTime() - parseISO(from).getTime()) / DAY);
}

/** act_by for an auto-renewal: term_end − notice_period_days (spec §4). */
export function noticeDeadline(
  c: Pick<Contract, "termEnd" | "noticeDays" | "noticeDeadlineOverride">,
): string {
  if (c.noticeDeadlineOverride !== undefined) return c.noticeDeadlineOverride ?? "";
  if (!c.termEnd) return "";
  return addDays(c.termEnd, -c.noticeDays);
}

export function renewalDate(c: Pick<Contract, "termEnd">): string {
  return addDays(c.termEnd, 1);
}

export type Urgency = "urgent" | "soon" | "later" | "past";

export function urgency(days: number): Urgency {
  if (days < 0) return "past";
  if (days <= 7) return "urgent";
  if (days <= 30) return "soon";
  return "later";
}

export interface RenewalMath {
  currentFee: number;
  quotedFee: number | null;
  quoteIncreasePct: number | null;
  cappedFee: number | null;
  perSeatAtCap: number;
  removableSeats: number;
  rightSizedSeats: number;
  rightSizedFee: number;
  capSavings: number; // quote → cap
  seatSavings: number; // cap → right-sized
}

/** Renewal math for the contract detail page (spec §6.3 and the lever rules in §4). */
export function renewalMath(c: Contract): RenewalMath {
  const quotedFee = c.quote?.annualFee ?? null;
  const cappedFee = c.upliftCapPct != null ? Math.round(c.annualFee * (1 + c.upliftCapPct / 100)) : null;
  const basis = cappedFee != null && quotedFee != null ? Math.min(cappedFee, quotedFee) : quotedFee ?? c.annualFee;
  const perSeatAtCap = basis / c.seats;

  const unused = c.usage ? c.usage.paid - c.usage.active : 0;
  const allowance = c.seatReductionPct != null ? Math.floor((c.seats * c.seatReductionPct) / 100) : unused;
  const removableSeats = Math.max(0, Math.min(unused, allowance));
  const rightSizedSeats = c.seats - removableSeats;
  const rightSizedFee = Math.round(perSeatAtCap * rightSizedSeats);

  const capSavings = quotedFee != null && cappedFee != null ? Math.max(0, quotedFee - cappedFee) : 0;
  const seatSavings = Math.round(basis - rightSizedFee);

  return {
    currentFee: c.annualFee,
    quotedFee,
    quoteIncreasePct: quotedFee != null ? Math.round(((quotedFee - c.annualFee) / c.annualFee) * 100) : null,
    cappedFee,
    perSeatAtCap,
    removableSeats,
    rightSizedSeats,
    rightSizedFee,
    capSavings,
    seatSavings,
  };
}

export type Tone = "firm" | "friendly";

/**
 * Template-based pushback email. In production this is where Claude drafts the email
 * from the extracted clauses; the template keeps the demo deterministic and offline.
 */
export function pushbackEmail(
  c: Contract,
  opts: { tone: Tone; includeSeats: boolean; company: string; signer: string },
): { subject: string; body: string } {
  const m = renewalMath(c);
  const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const deadline = parseISO(noticeDeadline(c)).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const replyBy = parseISO(addDays(noticeDeadline(c), -5)).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const capClause = c.clauses.find((cl) => /pric|uplift|increase/i.test(cl.title));
  const seatClause = c.clauses.find((cl) => /seat|subscription|reduc/i.test(cl.title));
  const orderRef = c.documents.find((d) => /order/i.test(d)) ?? c.documents[0];
  const firm = opts.tone === "firm";

  const paras: string[] = [];
  if (c.quote) {
    paras.push(
      firm
        ? `Thank you for the renewal quote for ${orderRef}. Before we can move forward, it needs to reflect the terms of our agreement.`
        : `Thanks for sending over the renewal quote for ${orderRef}. We value the partnership and want to get this renewal wrapped up smoothly.`,
    );
  } else {
    paras.push(
      firm
        ? `This is our written notice regarding the upcoming renewal of ${orderRef}.`
        : `We're getting ready for the upcoming renewal of ${orderRef} and wanted to give you notice early.`,
    );
  }
  if (m.quotedFee != null && m.cappedFee != null && capClause) {
    paras.push(
      firm
        ? `Section ${capClause.ref.replace("§", "")} of our agreement limits any renewal increase to ${c.upliftCapPct}% over the prior term. The quote shows a ${m.quoteIncreasePct}% increase (${fmt(m.quotedFee)}). At the ${c.upliftCapPct}% cap, the renewal fee cannot exceed ${fmt(m.cappedFee)}.`
        : `One thing we noticed: Section ${capClause.ref.replace("§", "")} of our agreement caps renewal increases at ${c.upliftCapPct}%, and the quote reflects ${m.quoteIncreasePct}% (${fmt(m.quotedFee)}). At the cap, the fee would be ${fmt(m.cappedFee)}.`,
    );
  }
  if (opts.includeSeats && m.removableSeats > 0) {
    paras.push(
      `In addition${seatClause ? `, under Section ${seatClause.ref.replace("§", "")}` : ""}, we are reducing our seat count at renewal. Please update the order to ${m.rightSizedSeats} ${c.product} seats, for an annual total of ${fmt(m.rightSizedFee)}.`,
    );
  }
  if (c.consolidation) {
    paras.push(
      `We will not be renewing our ${c.product} plan when the current term ends. Please treat this email as our written notice of cancellation under ${c.clauses[0]?.ref ?? "our agreement"}, and confirm that the subscription will not auto-renew.`,
    );
  } else if (!c.quote && !(opts.includeSeats && m.removableSeats > 0)) {
    paras.push(`We would like to review pricing and terms before the renewal date.`);
  }
  paras.push(
    c.consolidation
      ? `Please confirm by ${replyBy}, ahead of the ${deadline} notice date.`
      : firm
      ? `Please send a revised order form by ${replyBy} so we can sign before the ${deadline} notice date.`
      : `Could you send a revised order form by ${replyBy}? That gives us time to sign ahead of the ${deadline} notice date.`,
  );

  const body = `Hi [Name],\n\n${paras.join("\n\n")}\n\nBest regards,\n[Your name]\n${opts.signer}, ${opts.company}`;
  const ref = orderRef.match(/#[\w-]+/)?.[0] ?? orderRef;
  const cutting = opts.includeSeats && m.removableSeats > 0;
  const subject = c.consolidation
    ? `Notice of non-renewal: ${ref}`
    : c.quote
    ? cutting
      ? `Renewal quote ${ref}: pricing cap and seat count`
      : `Renewal quote ${ref}: pricing per ${capClause?.ref ?? "our agreement"}`
    : cutting
      ? `Renewal of ${ref}: seat reduction notice`
      : `Renewal of ${ref}`;
  return { subject, body };
}
