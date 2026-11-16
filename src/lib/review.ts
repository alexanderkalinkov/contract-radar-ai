// Confirming and correcting extracted terms. Pure functions, used by the API (cloud workspaces)
// and by the browser (demo mode, where contracts live in localStorage).
import { addDays } from "./engine";
import { REVIEW_FIELDS, type Extraction, type FieldKey, type FieldReview } from "./extraction";

export type ReviewValue = number | string | boolean | null;

export const FIELD_LABELS: Record<FieldKey, string> = {
  term_end: "Term ends",
  auto_renewal: "Auto-renewal",
  notice_period_days: "Notice period",
  uplift_cap_percent: "Uplift cap",
  seat_reduction_percent: "Seat reduction",
  annual_fee: "Annual fee",
  seats: "Seats",
};

/** What kind of input a correction needs. */
export const FIELD_INPUT: Record<FieldKey, "date" | "boolean" | "int" | "number"> = {
  term_end: "date",
  auto_renewal: "boolean",
  notice_period_days: "int",
  uplift_cap_percent: "number",
  seat_reduction_percent: "number",
  annual_fee: "number",
  seats: "int",
};

export const isFieldKey = (k: unknown): k is FieldKey => typeof k === "string" && (REVIEW_FIELDS as readonly string[]).includes(k);

/** Checks a corrected value. Returns the clean value, or an error message. null means "not in the contract". */
export function parseCorrection(field: FieldKey, raw: unknown): { value: ReviewValue } | { error: string } {
  if (raw === null || raw === "") return { value: null };
  const kind = FIELD_INPUT[field];
  if (kind === "boolean") return typeof raw === "boolean" ? { value: raw } : { error: "Choose yes or no." };
  if (kind === "date") {
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
      return { error: "Enter a date as YYYY-MM-DD." };
    }
    return { value: raw };
  }
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/[,\s]/g, "")) : NaN;
  if (!Number.isFinite(n) || n < 0) return { error: "Enter a number of 0 or more." };
  if (kind === "int" && !Number.isInteger(n)) return { error: "Enter a whole number." };
  if (n > 1e12) return { error: "That number is too large." };
  return { value: n };
}

export function noticeDeadlineOf(d: Pick<Extraction, "term_end" | "notice_period_days">): string | null {
  const end = d.term_end.value;
  const days = d.notice_period_days.value;
  if (!end || days == null || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return addDays(end, -days);
}

export type ReviewAction = { action: "confirm"; fields: FieldKey[] } | { action: "correct"; field: FieldKey; value: ReviewValue } | { action: "reset"; field: FieldKey };

/**
 * Applies one review action and returns a new extraction. Confirming keeps the value; correcting replaces it and keeps
 * the AI's first reading in `original`, so a later correction never loses it; reset clears the review and, after a
 * correction, puts the AI's value back.
 */
export function applyReview(d: Extraction, a: ReviewAction, by: string | null, at = new Date().toISOString()): Extraction {
  const reviews = { ...(d.reviews ?? {}) };
  const next: Extraction = { ...d };
  const setValue = (field: FieldKey, value: ReviewValue) => {
    (next as Record<FieldKey, { value: ReviewValue }>)[field] = { ...d[field], value } as never;
  };

  if (a.action === "confirm") {
    for (const f of a.fields) {
      const prev = reviews[f];
      // Confirming a corrected value keeps the correction on record.
      reviews[f] = prev?.status === "corrected" ? { ...prev, by, at } : { status: "confirmed", by, at };
    }
  } else if (a.action === "correct") {
    const prev = reviews[a.field];
    const original = prev?.status === "corrected" ? (prev.original ?? null) : (d[a.field].value as ReviewValue);
    if (original === a.value) {
      // Corrected back to what the AI read: that is a confirmation.
      reviews[a.field] = { status: "confirmed", by, at };
    } else {
      reviews[a.field] = { status: "corrected", by, at, original } satisfies FieldReview;
    }
    setValue(a.field, a.value);
  } else {
    const prev = reviews[a.field];
    if (prev?.status === "corrected") setValue(a.field, prev.original ?? null);
    delete reviews[a.field];
  }
  next.reviews = reviews;
  return next;
}

export function reviewProgress(d: Extraction): { reviewed: number; total: number; corrected: number } {
  const r = d.reviews ?? {};
  const keys = Object.keys(r).filter(isFieldKey);
  return { reviewed: keys.length, total: REVIEW_FIELDS.length, corrected: keys.filter((k) => r[k]?.status === "corrected").length };
}

/** The fields a reviewer can confirm in one click: not reviewed yet, quote verified in the document, high confidence. */
export function quickConfirmable(d: Extraction): FieldKey[] {
  return REVIEW_FIELDS.filter((k) => !d.reviews?.[k] && d.verified?.[k] && d[k].confidence === "high" && d[k].value != null);
}
