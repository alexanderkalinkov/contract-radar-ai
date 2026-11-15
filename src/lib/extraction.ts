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
  risks: z
    .array(z.string())
    .describe("Up to 3 short plain-English notes a finance lead should know, e.g. 'Price can change with 30 days notice'"),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

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
  risks: [
    "Notice is 60 days, double the usual 30, so the deadline comes early.",
    "Overage users are billed at list price, not your discounted rate.",
  ],
};
