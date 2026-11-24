# Savings share pricing ("no savings, no fee")

Outflow can bill a share of the savings it finds instead of a flat subscription. The flat plans (Starter, Growth,
Business) stay as the "predictable bill" option.

## The terms

| | |
|---|---|
| Savings fee | 20% of the first-year value of each confirmed saving |
| Cap | at most 10,000 (in the saving's currency) per saving |
| Platform fee | €29 a month or €290 a year, billed in advance |
| Credit | platform fees paid in the last 12 months are deducted from the next savings fee (same currency, each payment once) |
| Fair use | up to 25 new documents a month (not enforced in the app) |
| Billing | once, when the saving is confirmed; card on file is charged, otherwise Stripe emails an invoice due in 30 days |

The numbers live in `src/lib/billing/savings.ts` (fee rate, cap, fair use) and in Stripe (the platform fee prices with
lookup keys `cr_savings_month` and `cr_savings_year`; `PLATFORM_FEE` and the plan's `fallback` are only shown before
Stripe is set up). Confirmed savings keep the rate and cap they were confirmed with. Keep `/pricing` and the terms
(section 4a) in step when changing them.

### Why €29

Running costs per workspace, measured from the code on 24 November 2026:

- Reading one contract is three Claude Opus 5.5 calls over the whole document (terms, price increases, source
  quotes): about €0.40 to €0.60 for a 10 to 20 page contract.
- Onboarding 80 to 150 contracts is a one-off €40 to €90. Afterwards 10 to 20 new documents a month is €5 to €10.
- Hosting (Vercel Pro, Supabase Pro, Resend) is about €60 a month in total, about €6 per customer at 10 customers.
- Stripe takes about 3%.

So steady state is about €10 to €20 a month. €29 covers that; a large bulk import takes a few months to pay back.

## What counts as a saving

A saving is recorded in the **savings ledger** (Savings → Realized savings, `/savings`). It needs:

- **A source**: it must have come from an Outflow recommendation, one of
  - an approved renewal decision (cut seats, cancel, consolidate, renegotiate) from Approvals,
  - a pushback email Outflow drafted,
  - a savings opportunity Outflow flagged.
- **A contract** in the workspace.
- **A baseline**: what the next 12 months would have cost without the change (renewal quote, or current price plus the
  contract's uplift), and a note saying where it comes from.
- **The new annual price** (0 when cancelled). The saving is baseline minus new price.
- Optional evidence text, signing date and the signed document in Outflow.

Approved renewal decisions without a saving yet show at the top of the page with a "Record outcome" button that
prefills the form. One contract can have one live saving per renewal year, and one approved decision can have one
saving, so the same win can't be billed twice.

## Workflow

1. Anyone who can edit (not viewers) records a saving. It is **waiting for confirmation**.
2. An admin or Finance approver **confirms** it, or **disputes** it with a note. The recorder or an approver can
   **withdraw** it before it is confirmed.
3. On confirm, if the workspace is on the Savings share plan, the server works out the fee and creates a Stripe
   invoice (fee line, minus a credit line for platform fees). On a flat plan it is marked "Not billed".
4. The Stripe webhook updates the ledger when the invoice is paid, fails or is voided. If Stripe couldn't create the
   invoice, an admin can retry from the ledger.

Every step is written to the audit log (`saving.recorded`, `saving.confirmed`, `saving.disputed`, `saving.withdrawn`).

## Setup

1. Run `supabase/migrations/20261124200000_savings_share.sql` in the Supabase SQL editor (adds the plan and the
   `savings_ledger` table; safe to run again).
2. Re-run `npm run stripe:setup -- https://outflow.radivarius.com` (test key now, live key when going live). It creates
   the "Outflow Savings share" product with the €29 / €290 prices, adds it to the Customer Portal, and adds the
   `invoice.voided` and `invoice.marked_uncollectible` webhook events.

The ledger is read-only from the browser: all writes go through `/api/savings` with the service role, which checks
roles and computes fees.

## Notes

- Fees are invoiced in the saving's currency. A Stripe customer can only be billed in one currency, so a workspace
  with savings in USD and a EUR subscription will see the invoice fail; retry after sorting it out in Stripe.
- Refunds for reversed savings (the terms promise a credit within 90 days) are handled by hand in Stripe.
