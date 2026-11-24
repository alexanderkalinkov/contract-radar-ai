// Savings-share pricing: the fee terms and the savings ledger's shapes. Shared by the browser and the server.
//
// How it works (docs/savings-share.md):
// - A saving counts only when it came from an Outflow recommendation: an approved renewal decision, a pushback
//   email Outflow drafted, or a savings opportunity Outflow flagged.
// - Each saving has a baseline (what the next 12 months would have cost: the renewal quote, or the current price
//   plus the contract's uplift) and the new annual price, with evidence.
// - A workspace admin or Finance approver confirms it. On the Savings plan, the fee is then invoiced once:
//   FEE_RATE of the first-year saving, at most FEE_CAP per saving, minus the platform fees paid in the last
//   12 months that haven't been credited yet.
// - On a flat plan the ledger is still kept (it's the ROI report), but nothing is billed.
//
// Changing a number here changes it for savings confirmed from then on. Confirmed savings keep the rate and cap
// they were confirmed with (stored on the row). Keep the pricing page and docs/savings-share.md in step.

export const FEE_RATE = 0.2;
/** Most we charge for one saving, in the saving's currency. */
export const FEE_CAP = 10_000;
/** Platform fee, in EUR. The Stripe prices (cr_savings_month / cr_savings_year) are the source of truth. */
export const PLATFORM_FEE = { month: 29, year: 290 };
/** New documents a month that the platform fee covers (fair use, not enforced). */
export const FAIR_USE_DOCS_PER_MONTH = 25;
/** Days a customer has to pay a savings invoice sent by email. */
export const INVOICE_DAYS = 30;

export type SavingSource = "approval" | "pushback" | "opportunity";
export type SavingKind = "price" | "seats" | "cancel" | "consolidate" | "terms";
export type SavingStatus = "pending" | "confirmed" | "disputed" | "void";
export type FeeStatus = "none" | "not_billed" | "credited" | "invoiced" | "paid" | "failed" | "void";

export const SOURCES: { value: SavingSource; label: string; hint: string }[] = [
  { value: "approval", label: "Approved renewal decision", hint: "A cut, cancel, consolidate or renegotiate decision approved in Approvals." },
  { value: "pushback", label: "Pushback email from Outflow", hint: "You sent the vendor a pushback email Outflow drafted." },
  { value: "opportunity", label: "Savings opportunity in Outflow", hint: "Outflow flagged it on the Savings page or a contract page." },
];

export const KINDS: { value: SavingKind; label: string }[] = [
  { value: "price", label: "Lower price or avoided increase" },
  { value: "seats", label: "Fewer seats" },
  { value: "cancel", label: "Cancelled" },
  { value: "consolidate", label: "Consolidated into another tool" },
  { value: "terms", label: "Better terms (cap, discount)" },
];

export const sourceLabel = (v: SavingSource) => SOURCES.find((s) => s.value === v)?.label ?? v;
export const kindLabel = (v: SavingKind) => KINDS.find((k) => k.value === v)?.label ?? v;

export const STATUS_LABEL: Record<SavingStatus, string> = {
  pending: "Waiting for confirmation",
  confirmed: "Confirmed",
  disputed: "Disputed",
  void: "Withdrawn",
};

export const FEE_STATUS_LABEL: Record<FeeStatus, string> = {
  none: "",
  not_billed: "Not billed (flat plan)",
  credited: "Covered by platform fees",
  invoiced: "Invoiced",
  paid: "Paid",
  failed: "Payment failed",
  void: "Invoice voided",
};

export interface Saving {
  id: string;
  contractId: string | null;
  reviewId: string | null;
  newContractId: string | null;
  vendor: string;
  source: SavingSource;
  kind: SavingKind;
  currency: string;
  baselineAnnual: number;
  newAnnual: number;
  annualSaving: number;
  baselineNote: string;
  evidence: string | null;
  signedOn: string | null;
  status: SavingStatus;
  recordedByEmail: string | null;
  recordedAt: string;
  confirmedByEmail: string | null;
  confirmedAt: string | null;
  disputeNote: string | null;
  feeRate: number | null;
  feeCap: number | null;
  feeGross: number | null;
  creditApplied: number | null;
  feeNet: number | null;
  feeStatus: FeeStatus;
  invoiceUrl: string | null;
  invoicedAt: string | null;
  paidAt: string | null;
}

/** A renewal decision that was approved and could become a saving, prefilled for the record form. */
export interface SavingCandidate {
  reviewId: string;
  contractId: string;
  vendor: string;
  recommendation: string;
  kind: SavingKind;
  currency: string;
  baselineAnnual: number | null;
  expectedSavings: number | null;
  baselineNote: string;
  decidedAt: string | null;
}

export interface SavingInput {
  contractId?: string | null;
  reviewId?: string | null;
  newContractId?: string | null;
  vendor: string;
  source: SavingSource;
  kind: SavingKind;
  currency: string;
  baselineAnnual: number;
  newAnnual: number;
  baselineNote: string;
  evidence?: string | null;
  signedOn?: string | null;
}

export type SavingOp =
  | ({ op: "record" } & SavingInput)
  | { op: "confirm"; id: string }
  | { op: "dispute"; id: string; note: string }
  | { op: "withdraw"; id: string }
  | { op: "retry_invoice"; id: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The fee for one saving before credits: rate × first-year saving, at most the cap. */
export function grossFee(annualSaving: number, rate = FEE_RATE, cap = FEE_CAP): number {
  if (!(annualSaving > 0)) return 0;
  return round2(Math.min(annualSaving * rate, cap));
}

/** Gross fee, credit used and what is left to invoice. Credit only applies in the same currency. */
export function feeBreakdown(
  annualSaving: number,
  creditAvailable: number,
  rate = FEE_RATE,
  cap = FEE_CAP,
): { gross: number; credit: number; net: number } {
  const gross = grossFee(annualSaving, rate, cap);
  const credit = round2(Math.max(0, Math.min(gross, creditAvailable)));
  return { gross, credit, net: round2(gross - credit) };
}

/** Which kind of saving a renewal decision usually is. */
export function kindForRecommendation(r: string): SavingKind {
  if (r === "cut_seats") return "seats";
  if (r === "cancel") return "cancel";
  if (r === "consolidate") return "consolidate";
  return "price";
}

export const pct = (rate: number) => `${Math.round(rate * 100)}%`;

export function money(amount: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-IE")}`;
  }
}

/** Totals for the ledger header. Withdrawn and disputed savings don't count. */
export function ledgerTotals(list: Saving[]) {
  const live = list.filter((s) => s.status === "confirmed");
  const pending = list.filter((s) => s.status === "pending");
  const byCurrency = (xs: Saving[], f: (s: Saving) => number) => {
    const m = new Map<string, number>();
    for (const s of xs) m.set(s.currency, (m.get(s.currency) ?? 0) + f(s));
    return [...m.entries()].map(([currency, amount]) => ({ currency, amount: round2(amount) }));
  };
  return {
    confirmed: byCurrency(live, (s) => s.annualSaving),
    pending: byCurrency(pending, (s) => s.annualSaving),
    fees: byCurrency(
      live.filter((s) => s.feeStatus === "invoiced" || s.feeStatus === "paid" || s.feeStatus === "credited"),
      (s) => s.feeGross ?? 0,
    ),
    pendingCount: pending.length,
  };
}
