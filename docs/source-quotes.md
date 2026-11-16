# Source quotes and term review

Legal and Finance need to see where every extracted value came from before they trust it.

## How quotes are found

`extractContract` (src/lib/server/extract.ts) now sends three requests in parallel:

1. The renewal terms (structured output).
2. Document kind and price escalators (structured output).
3. **Citation pass**: the same document with Claude's citations turned on, asking for one line per term
   (`[term_end] ...`, `[notice_period_days] ...`). Structured outputs can't be combined with citations, which is why
   this is a separate request; it adds no fields to the schema.

A citation's `cited_text` is copied from the document by the API, with its page for PDFs, so it is a real quote.
For every term that has a value and a citation, the cited passage replaces the model's own quote and the term is
marked in `extraction.verified`. If the citation pass fails, the contract is still saved with the model's quotes,
shown as "Quote not matched". Contracts read before this change show neither badge.

Price escalators keep the model's own quotes for now.

## Reviewing terms

On a contract page each term has **Confirm** and **Correct**, plus a one-click "Confirm N verified, high-confidence
terms". Reviews are stored in `extraction.reviews` (who, when, and the AI's original value for corrections), so no
database change is needed. A correction also updates the denormalised columns (term end, notice deadline, fee,
seats, ...), so the dashboard, calendar and reminder emails use the corrected value. Clicking a page number opens
the original PDF at that page.

API: `PATCH /api/contracts/:id` with `{ review: { action: "confirm", fields: [...] } }`,
`{ review: { action: "correct", field, value } }` or `{ review: { action: "reset", field } }`.
Logic shared by the API and demo mode lives in src/lib/review.ts.
