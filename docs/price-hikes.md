# Price-hike tracking

Outflow compares each renewal price with the price before it and flags increases.

## How documents are matched

Every uploaded PDF is extracted as before, plus two new fields:

- `document_kind`: contract, order form, **renewal quote**, amendment, invoice or other. Documents saved before this
  change have no kind; a name containing "quote" or "proposal" counts as a renewal quote.
- `price_escalators`: clauses that raise the price on their own (fixed annual uplift, CPI, step-ups, renewal at list price).

`src/lib/price-history.ts` then lines documents up per vendor (legal suffixes like "Inc." are ignored, so
"Salesforce, Inc." and "salesforce.com inc" match, while "Salesforce, Inc. (Tableau)" stays separate):

- A **renewal quote** is attached to the vendor's current signed document. The contract page shows the quote against
  the current fee, and the quote no longer appears as a contract of its own.
- A **newer signed document** replaces the older one. The older term moves into the price history.
- A renewal that more than doubles or halves the price, or is in another currency, is treated as a different product.

If a match is wrong, open the contract and use **Compare prices with** to pick the right document, or "Nothing".
That choice is stored in `contracts.supersedes_id` (run `supabase/migrations/20261116200000_price_history.sql` first).

## What a price change shows

Old fee → new fee, the increase in percent and money, per-seat price, and the verdict against the cap in the earlier
document: over the cap (by how much), within the cap, or no cap.

## Where it shows up

- Dashboard: **Price hikes** card, and a "Price increase" savings opportunity (over-cap amount, or the amount above a
  3% increase when there is no cap).
- Price changes page: every hike, plus contracts whose renewal came in flat or lower.
- Contract page: **Price change** panel, price history, built-in escalators, and a **Push back on increase** email goal.
  Claude gets the old and new fees, the cap and the clause, and asks for the capped price (or a credit, for a renewal
  that is already signed).
- Renewal reminder emails: a line under the contract, e.g. "Renewal quote is up 9% (+$28,728/yr), $12,768 over your 5% cap",
  and advice to push back. Older terms and quotes never get reminders of their own.

## Trying it

- Demo mode (no API key): upload any PDF, then another whose file name contains "quote". The second comes back as a
  renewal quote 10% above the first, over its 6% cap.
- Demo workspace: Salesforce and HubSpot have renewal quotes, and Zendesk has last year's order form. Reset the demo
  workspace in Workspace settings to get them.
