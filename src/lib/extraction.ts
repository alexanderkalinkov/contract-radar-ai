import { z } from "zod";

// What Claude pulls out of an uploaded contract. Every field keeps its evidence
// (quoted text and page) and a confidence level, as the spec requires (§4).

const evidence = {
  quote: z.string().nullable().describe("Exact sentence(s) from the contract that support the value, or null if not found"),
  page: z.number().int().nullable().describe("1-based page number where the quote appears, or null"),
  confidence: z.enum(["high", "medium", "low"]),
};

export const ExtractionSchema = z.object({
  vendor: z.string().describe("The SaaS vendor's company name"),
  agreement_name: z.string().describe("Short name of the document, e.g. 'Master Subscription Agreement' or 'Order Form #00417'"),
  document_kind: z
    .enum(["contract", "order_form", "renewal_quote", "amendment", "invoice", "other"])
    .describe(
      "What this document is: a signed agreement or MSA (contract), a signed order form (order_form), a renewal quote or proposal the vendor sent but the customer has not signed yet (renewal_quote), an amendment, an invoice, or other",
    ),
  customer: z.string().nullable(),
  term_start: z.string().nullable().describe("Start of the current term, YYYY-MM-DD"),
  term_end: z
    .object({ value: z.string().nullable().describe("Last day of the current term, YYYY-MM-DD"), ...evidence })
    .describe("End of the current subscription term"),
  auto_renewal: z.object({
    value: z.boolean().nullable().describe("true if the contract renews automatically unless notice is given"),
    renewal_term_months: z.number().int().nullable(),
    ...evidence,
  }),
  notice_period_days: z.object({
    value: z.number().int().nullable().describe("Days of written notice required before the term ends to cancel or change the renewal"),
    ...evidence,
  }),
  uplift_cap_percent: z.object({
    value: z.number().nullable().describe("Maximum % price increase allowed at renewal, or null if the contract has no cap"),
    ...evidence,
  }),
  seat_reduction_percent: z.object({
    value: z.number().nullable().describe("Max % of seats/licenses the customer may reduce at renewal, or null"),
    ...evidence,
  }),
  annual_fee: z.object({ value: z.number().nullable().describe("Total annual fee in the contract currency"), ...evidence }),
  seats: z.object({ value: z.number().int().nullable(), ...evidence }),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. USD"),
  price_escalators: z
    .array(
      z.object({
        description: z.string().describe("Plain English, e.g. 'Fees rise 5% on each anniversary' or 'Renewal at then-current list price'"),
        percent: z.number().nullable().describe("The automatic increase in percent, or null if the clause sets no number (list price, CPI)"),
        frequency: z.enum(["annual", "at_renewal", "other"]),
        ...evidence,
      }),
    )
    .describe(
      "Clauses that raise the price automatically without a new negotiation: fixed annual uplifts, CPI-linked increases, step-ups in later years, or renewal at then-current list price. Empty if none.",
    ),
  risks: z
    .array(z.string())
    .describe("Up to 3 short plain-English notes a finance lead should know, e.g. 'Price can change with 30 days notice'"),
});

/** The single-value terms a reviewer can confirm or correct, in the order they are shown. */
export const REVIEW_FIELDS = ["term_end", "auto_renewal", "notice_period_days", "uplift_cap_percent", "seat_reduction_percent", "annual_fee", "seats"] as const;
export type FieldKey = (typeof REVIEW_FIELDS)[number];

/** A person's check of one extracted value. "corrected" keeps what the AI first read in `original`. */
export interface FieldReview {
  status: "confirmed" | "corrected";
  by: string | null;
  at: string;
  original?: number | string | boolean | null;
}

/**
 * What Claude reads, plus two things added after the read (kept out of the structured-output schema so it stays small):
 * - verified: the quote for that field came back from Claude's citations, so it is text copied from the document itself
 *   with the page it is on, not text the model wrote.
 * - reviews: who confirmed or corrected each value, and when.
 */
export type Extraction = z.infer<typeof ExtractionSchema> & {
  verified?: Partial<Record<FieldKey, boolean>>;
  reviews?: Partial<Record<FieldKey, FieldReview>>;
};

export interface ExtractionResult {
  fileName: string;
  extractedAt: string;
  demo: boolean;
  model?: string;
  data: Extraction;
  noticeDeadline: string | null; // term_end − notice_period_days
}

/** Returned when no ANTHROPIC_API_KEY is configured, so the flow is still clickable. */
export const DEMO_EXTRACTION: Extraction = {
  vendor: "Acme Analytics, Inc.",
  agreement_name: "Master Subscription Agreement + Order Form #AC-2207",
  document_kind: "contract",
  customer: "Northwind Logistics",
  term_start: "2026-02-01",
  term_end: {
    value: "2027-01-31",
    quote: "The initial Subscription Term begins on February 1, 2026 and ends on January 31, 2027.",
    page: 1,
    confidence: "high",
  },
  auto_renewal: {
    value: true,
    renewal_term_months: 12,
    quote:
      "Each Subscription Term will automatically renew for successive twelve (12) month periods unless either party gives written notice of non-renewal at least sixty (60) days before the end of the then-current term.",
    page: 2,
    confidence: "high",
  },
  notice_period_days: {
    value: 60,
    quote: "...at least sixty (60) days before the end of the then-current term.",
    page: 2,
    confidence: "high",
  },
  uplift_cap_percent: {
    value: 6,
    quote: "Fees for any renewal term will not increase by more than six percent (6%) over the fees for the prior term.",
    page: 2,
    confidence: "high",
  },
  seat_reduction_percent: {
    value: 15,
    quote: "Customer may reduce the number of Named Users by up to fifteen percent (15%) effective at renewal.",
    page: 3,
    confidence: "medium",
  },
  annual_fee: { value: 86_400, quote: "Annual Subscription Fee: USD 86,400", page: 3, confidence: "high" },
  seats: { value: 120, quote: "Named Users: 120", page: 3, confidence: "high" },
  currency: "USD",
  price_escalators: [],
  verified: { term_end: true, auto_renewal: true, notice_period_days: true, uplift_cap_percent: true, seat_reduction_percent: true, annual_fee: true, seats: true },
  risks: [
    "Notice is 60 days, double the usual 30, so the deadline comes early.",
    "Overage users are billed at list price, not your discounted rate.",
  ],
};

/**
 * Returned instead of DEMO_EXTRACTION when a demo upload's file name says it is a renewal quote, so price-hike
 * tracking can be tried without an API key: it is 10% over the demo contract's fee, against a 6% cap.
 */
export const DEMO_RENEWAL_QUOTE: Extraction = {
  ...DEMO_EXTRACTION,
  agreement_name: "Renewal Quote #AC-3108",
  document_kind: "renewal_quote",
  term_start: "2027-02-01",
  term_end: { value: "2028-01-31", quote: "Renewal Subscription Term: February 1, 2027 to January 31, 2028.", page: 1, confidence: "high" },
  annual_fee: { value: 95_040, quote: "Annual Subscription Fee (renewal term): USD 95,040", page: 1, confidence: "high" },
  seats: { value: 120, quote: "Named Users: 120", page: 1, confidence: "high" },
  price_escalators: [],
  risks: ["The renewal fee is 10% higher than the current term.", "Quote expires before the notice deadline, so it may be used to rush a decision."],
};

/** Documents saved before price-hike tracking have no document_kind; infer it from the name. */
export function documentKind(d: Pick<Extraction, "agreement_name"> & { document_kind?: Extraction["document_kind"] }): Extraction["document_kind"] {
  if (d.document_kind) return d.document_kind;
  return /\b(quote|quotation|proposal)\b/i.test(d.agreement_name) ? "renewal_quote" : "contract";
}

export type Escalator = Extraction["price_escalators"][number];

/** Price escalators, or none for documents saved before they were extracted. */
export function escalatorsOf(d: { price_escalators?: Escalator[] }): Escalator[] {
  return Array.isArray(d.price_escalators) ? d.price_escalators : [];
}

/** The same schema, but accepting documents saved before document_kind and price_escalators existed. */
export const StoredExtractionSchema = ExtractionSchema.extend({
  document_kind: ExtractionSchema.shape.document_kind.optional(),
  price_escalators: ExtractionSchema.shape.price_escalators.optional(),
  verified: z.partialRecord(z.enum(REVIEW_FIELDS), z.boolean()).optional(),
  reviews: z
    .partialRecord(
      z.enum(REVIEW_FIELDS),
      z.object({
        status: z.enum(["confirmed", "corrected"]),
        by: z.string().nullable(),
        at: z.string(),
        original: z.union([z.number(), z.string(), z.boolean()]).nullable().optional(),
      }),
    )
    .optional(),
});
