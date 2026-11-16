// Price-hike tracking: line up every uploaded document for the same vendor (last year's order form, this year's
// renewal quote, the signed renewal) and compare each renewal price with the one before it.
// Pure functions, shared by the browser (dashboard, contract pages) and the server (renewal alert emails).
import { addDays } from "./engine";
import { documentKind, escalatorsOf } from "./extraction";
import type { SavedContract } from "./saved";
import type { Contract, PriceChange, PriceEscalator } from "./types";

/** "Salesforce, Inc." and "salesforce.com inc" match; "Salesforce, Inc. (Tableau)" stays separate. */
export function vendorKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(com|io|ai|co)\b/g, " ")
    .replace(/[^a-z0-9()]+/g, " ")
    .replace(/\b(inc|incorporated|llc|ltd|limited|gmbh|corp|corporation|co|company|plc|sa|ag|bv|nv|oy|ab|pty|srl|sas|unlimited)\b/g, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const isQuote = (s: SavedContract) => documentKind(s.data) === "renewal_quote";
const feeOf = (s: SavedContract) => (s.data.annual_fee.value != null && s.data.annual_fee.value > 0 ? s.data.annual_fee.value : null);
const isDate = (v: string | null | undefined): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** When a document's terms start: the stated start, else a year before the term end, else when it was uploaded. */
function startOf(s: SavedContract): string {
  if (isDate(s.data.term_start)) return s.data.term_start;
  if (isDate(s.data.term_end.value)) return addDays(s.data.term_end.value, -364);
  return s.extractedAt.slice(0, 10);
}
const order = (a: SavedContract, b: SavedContract) => startOf(a).localeCompare(startOf(b)) || a.extractedAt.localeCompare(b.extractedAt);

/** A renewal rarely more than doubles or halves the price; outside that, two documents are probably different products. */
function plausible(prev: SavedContract, next: SavedContract): boolean {
  const a = feeOf(prev);
  const b = feeOf(next);
  if (a == null || b == null) return true;
  const ratio = b / a;
  if (ratio < 0.5 || ratio > 2) return false;
  const ca = prev.data.currency?.toUpperCase();
  const cb = next.data.currency?.toUpperCase();
  return !ca || !cb || ca === cb;
}

export function compare(prev: SavedContract, next: SavedContract, source: PriceChange["source"], shownOn: SavedContract): PriceChange | null {
  const previousFee = feeOf(prev);
  const newFee = feeOf(next);
  if (previousFee == null || newFee == null) return null;
  const previousSeats = prev.data.seats.value ?? null;
  const newSeats = next.data.seats.value ?? null;
  const perSeatPrevious = previousSeats ? previousFee / previousSeats : null;
  const perSeatNew = newSeats ? newFee / newSeats : null;
  const capPct = prev.data.uplift_cap_percent.value;
  const cappedFee = capPct != null ? Math.round(previousFee * (1 + capPct / 100)) : null;
  return {
    source,
    contractId: shownOn.id,
    previousId: prev.id,
    newId: next.id,
    previousDoc: prev.data.agreement_name,
    newDoc: next.data.agreement_name,
    receivedOn: next.extractedAt.slice(0, 10),
    currency: next.data.currency ?? prev.data.currency ?? null,
    previousFee,
    newFee,
    deltaAbs: newFee - previousFee,
    deltaPct: Math.round(((newFee - previousFee) / previousFee) * 1000) / 10,
    previousSeats,
    newSeats,
    perSeatPrevious,
    perSeatNew,
    perSeatPct: perSeatPrevious && perSeatNew ? Math.round(((perSeatNew - perSeatPrevious) / perSeatPrevious) * 1000) / 10 : null,
    capPct,
    cappedFee,
    overCap: cappedFee != null ? Math.max(0, newFee - cappedFee) : 0,
    actBy: (source === "quote" ? shownOn.noticeDeadline : next.noticeDeadline) ?? "",
  };
}

export interface PriceHistory {
  /** Documents folded into another one: older terms replaced by a renewal, and quotes shown on their contract. */
  hidden: Set<string>;
  /** For a hidden document, the contract it is shown on. */
  shownOn: Map<string, string>;
  /** Latest price change for each visible contract. */
  changes: Map<string, PriceChange>;
  /** The documents for each visible contract, oldest first (including itself and any quote). */
  timeline: Map<string, SavedContract[]>;
}

/**
 * Links documents into one chain per vendor and product.
 * - A signed document replaces the latest earlier signed document for the same vendor (or the one picked by hand).
 * - A renewal quote is attached to the vendor's current signed document; the latest quote wins.
 * - supersedesId set to the document's own id means "don't compare this one with anything".
 */
export function buildPriceHistory(saved: SavedContract[]): PriceHistory {
  const byId = new Map(saved.map((s) => [s.id, s]));
  const standalone = (s: SavedContract) => s.supersedesId === s.id;
  const manual = (s: SavedContract) => (s.supersedesId && s.supersedesId !== s.id ? byId.get(s.supersedesId) ?? null : null);
  const pred = new Map<string, SavedContract>(); // signed doc → the signed doc it replaced
  const succ = new Map<string, SavedContract>();
  const quoteFor = new Map<string, SavedContract>(); // signed doc → latest quote
  const quoteTarget = new Map<string, string>();

  const signed = saved.filter((s) => !isQuote(s)).sort(order);
  const quotes = saved.filter(isQuote).sort(order);

  // Links picked by hand first, so automatic matching works around them.
  for (const s of signed) {
    const p = manual(s);
    if (p && !isQuote(p) && !succ.has(p.id)) {
      pred.set(s.id, p);
      succ.set(p.id, s);
    }
  }
  for (const s of signed) {
    if (pred.has(s.id) || standalone(s) || s.supersedesId) continue;
    const key = vendorKey(s.data.vendor);
    const earlier = signed.filter(
      (p) =>
        p.id !== s.id &&
        !succ.has(p.id) &&
        !standalone(p) &&
        vendorKey(p.data.vendor) === key &&
        order(p, s) < 0 &&
        // The new term must end after the old one, or they are two products running side by side.
        (!isDate(p.data.term_end.value) || !isDate(s.data.term_end.value) || s.data.term_end.value > p.data.term_end.value) &&
        plausible(p, s),
    );
    const p = earlier[earlier.length - 1];
    if (p) {
      pred.set(s.id, p);
      succ.set(p.id, s);
    }
  }

  const head = (s: SavedContract) => {
    let x = s;
    for (let n = succ.get(x.id); n; n = succ.get(x.id)) x = n;
    return x;
  };
  for (const q of quotes) {
    if (standalone(q)) continue;
    let target = manual(q);
    if (target && isQuote(target)) target = null;
    if (target) target = head(target);
    else if (!q.supersedesId) {
      const key = vendorKey(q.data.vendor);
      const heads = signed.filter((s) => !succ.has(s.id) && !standalone(s) && vendorKey(s.data.vendor) === key && plausible(s, q));
      // Several products from one vendor: the one whose price is closest to the quote.
      const qf = feeOf(q);
      heads.sort((a, b) => (qf == null ? 0 : Math.abs((feeOf(a) ?? 0) - qf) - Math.abs((feeOf(b) ?? 0) - qf)));
      target = heads[0] ?? null;
    }
    if (!target) continue;
    quoteFor.set(target.id, q); // quotes are in order, so the latest one wins
    quoteTarget.set(q.id, target.id);
  }

  const hidden = new Set<string>();
  const shownOn = new Map<string, string>();
  const changes = new Map<string, PriceChange>();
  const timeline = new Map<string, SavedContract[]>();

  for (const s of signed) {
    if (succ.has(s.id)) continue; // not the current document
    const chain: SavedContract[] = [s];
    for (let p = pred.get(s.id); p; p = pred.get(p.id)) chain.unshift(p);
    for (const p of chain.slice(0, -1)) {
      hidden.add(p.id);
      shownOn.set(p.id, s.id);
    }
    const q = quoteFor.get(s.id);
    if (q) chain.push(q);
    timeline.set(s.id, chain);
    const prev = pred.get(s.id);
    const change = q ? compare(s, q, "quote", s) : prev ? compare(prev, s, "renewal", s) : null;
    if (change) changes.set(s.id, change);
  }
  for (const [qid, target] of quoteTarget) {
    hidden.add(qid);
    shownOn.set(qid, target);
  }
  // Earlier quotes for the same contract.
  for (const q of quotes) if (!quoteTarget.has(q.id) && !hidden.has(q.id)) timeline.set(q.id, [q]);
  return { hidden, shownOn, changes, timeline };
}

/** Price change for any contract: uploaded ones carry it, sample ones derive it from their quote. */
export function priceChangeFor(c: Contract): PriceChange | null {
  if (c.priceChange) return c.priceChange;
  if (!c.quote || !c.annualFee) return null;
  const capPct = c.upliftCapPct;
  const cappedFee = capPct != null ? Math.round(c.annualFee * (1 + capPct / 100)) : null;
  const newFee = c.quote.annualFee;
  const per = c.seats ? c.annualFee / c.seats : null;
  const perNew = c.seats ? newFee / c.seats : null;
  return {
    source: "quote",
    contractId: c.id,
    previousId: null,
    newId: null,
    previousDoc: c.documents.join(" + "),
    newDoc: "Renewal quote",
    receivedOn: c.quote.receivedOn,
    currency: "USD",
    previousFee: c.annualFee,
    newFee,
    deltaAbs: newFee - c.annualFee,
    deltaPct: Math.round(((newFee - c.annualFee) / c.annualFee) * 1000) / 10,
    previousSeats: c.seats || null,
    newSeats: c.seats || null,
    perSeatPrevious: per,
    perSeatNew: perNew,
    perSeatPct: per && perNew ? Math.round(((perNew - per) / per) * 1000) / 10 : null,
    capPct,
    cappedFee,
    overCap: cappedFee != null ? Math.max(0, newFee - cappedFee) : 0,
    actBy: c.noticeDeadlineOverride ?? (c.termEnd ? addDays(c.termEnd, -c.noticeDays) : ""),
  };
}

export function escalatorsFromSaved(s: SavedContract): PriceEscalator[] {
  return escalatorsOf(s.data).map((e) => ({ description: e.description, percent: e.percent, frequency: e.frequency, quote: e.quote, page: e.page }));
}

/** What a contract's built-in escalators add next term, when they name a number. */
export function escalatorIncrease(c: Pick<Contract, "annualFee" | "escalators">): { pct: number; amount: number } | null {
  const pcts = (c.escalators ?? []).map((e) => e.percent).filter((p): p is number => p != null && p > 0);
  if (!pcts.length || !c.annualFee) return null;
  const pct = Math.max(...pcts);
  return { pct, amount: Math.round((c.annualFee * pct) / 100) };
}

/** "+12%" / "−3.5%" */
export const signedPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;

/** How a price change reads in one line, e.g. "Up 12% (+$38,304), $22,344 over the 5% cap". */
export function hikeVerdict(p: PriceChange): "over_cap" | "within_cap" | "no_cap" | "flat_or_down" {
  if (p.deltaAbs <= 0) return "flat_or_down";
  if (p.capPct == null) return "no_cap";
  return p.overCap > 0 ? "over_cap" : "within_cap";
}
