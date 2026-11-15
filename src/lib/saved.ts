// A contract the user uploaded, as stored in Supabase (or in the browser in demo mode),
// and the adapter that lets uploaded contracts flow through the same views as the sample data.
import type { Extraction, ExtractionResult } from "./extraction";
import type { Clause, Confidence, Contract } from "./types";

export interface SavedContract extends ExtractionResult {
  id: string;
  hasFile: boolean;
  uploadedByEmail?: string | null;
}

/** Row shape of public.contracts. */
export interface ContractRow {
  id: string;
  workspace_id: string;
  file_name: string;
  file_path: string | null;
  uploaded_by_email: string | null;
  extraction: Extraction;
  notice_deadline: string | null;
  model: string | null;
  demo: boolean;
  created_at: string;
}

export function rowToSaved(r: ContractRow): SavedContract {
  return {
    id: r.id,
    fileName: r.file_name,
    extractedAt: r.created_at,
    demo: r.demo,
    model: r.model ?? undefined,
    data: r.extraction,
    noticeDeadline: r.notice_deadline,
    hasFile: Boolean(r.file_path),
    uploadedByEmail: r.uploaded_by_email,
  };
}

/** Columns we denormalise out of the extraction so they can be queried and sorted. */
export function extractionColumns(d: Extraction, noticeDeadline: string | null) {
  const isDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  return {
    vendor: d.vendor.slice(0, 200),
    agreement_name: d.agreement_name,
    term_end: isDate(d.term_end.value),
    auto_renew: d.auto_renewal.value,
    renewal_term_months: d.auto_renewal.renewal_term_months,
    notice_days: d.notice_period_days.value,
    notice_deadline: noticeDeadline,
    uplift_cap_pct: d.uplift_cap_percent.value,
    seat_reduction_pct: d.seat_reduction_percent.value,
    annual_fee: d.annual_fee.value,
    seats: d.seats.value,
    currency: d.currency,
  };
}

const HUES = ["#0B5CAB", "#4A154B", "#1F5CD6", "#6B2BD9", "#C2410C", "#B42318", "#067647", "#475467", "#0E7490"];

export function initialsFor(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
  const w = words[0] ?? "?";
  return (w[0] ?? "?").toUpperCase() + (w[1] ?? "").toLowerCase();
}

export function hueFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

/** Uploaded contracts use ids prefixed so they never collide with the sample ids. */
export const isSampleId = (id: string) => !/^[0-9a-f-]{36}$|^local-/.test(id);

export function savedToContract(s: SavedContract): Contract {
  const d = s.data;
  const clauses: Clause[] = [];
  const add = (ref: string, title: string, f: { quote: string | null; page: number | null; confidence: Confidence }, meaning: string) => {
    if (f.quote) clauses.push({ ref, title, document: d.agreement_name, page: f.page ?? 0, confidence: f.confidence, quote: f.quote, meaning });
  };
  add("Term", "Term end", d.term_end, d.term_end.value ? `Current term ends ${d.term_end.value}.` : "");
  add("Renewal", "Auto-renewal", d.auto_renewal, d.auto_renewal.value ? "Renews automatically unless you give notice." : "Does not auto-renew.");
  add("Notice", "Notice period", d.notice_period_days, d.notice_period_days.value != null ? `${d.notice_period_days.value} days' notice required.` : "");
  add("Pricing", "Renewal pricing", d.uplift_cap_percent, d.uplift_cap_percent.value != null ? `Increases capped at ${d.uplift_cap_percent.value}%.` : "No cap on renewal increases.");
  add("Seats", "Seat reductions", d.seat_reduction_percent, d.seat_reduction_percent.value != null ? `Up to ${d.seat_reduction_percent.value}% of seats can be cut at renewal.` : "");

  return {
    id: s.id,
    vendor: d.vendor,
    product: "",
    initials: initialsFor(d.vendor),
    hue: hueFor(d.vendor),
    category: "Uploaded",
    owner: s.uploadedByEmail ?? "You",
    documents: [d.agreement_name],
    pages: 0,
    termEnd: d.term_end.value ?? "",
    autoRenew: Boolean(d.auto_renewal.value),
    renewalTermMonths: d.auto_renewal.renewal_term_months ?? 12,
    noticeDays: d.notice_period_days.value ?? 0,
    upliftCapPct: d.uplift_cap_percent.value,
    seatReductionPct: d.seat_reduction_percent.value,
    annualFee: d.annual_fee.value ?? 0,
    seats: d.seats.value ?? 0,
    clauses,
    deadlineLabel: d.auto_renewal.value ? "Notice deadline before auto-renewal" : "Term ends",
    uploaded: true,
    noticeDeadlineOverride: s.noticeDeadline,
  };
}

export function isRisky(s: SavedContract): string[] {
  const d = s.data;
  const flags: string[] = [];
  if (d.auto_renewal.value && d.uplift_cap_percent.value == null) flags.push("Auto-renews with no price-increase cap");
  if ((d.notice_period_days.value ?? 0) >= 60) flags.push(`Long notice period (${d.notice_period_days.value} days)`);
  if (!s.noticeDeadline) flags.push("Notice deadline not found: check the term and notice clauses");
  return flags;
}
