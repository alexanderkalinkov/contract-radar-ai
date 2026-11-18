# Seat usage from logins

Outflow compares what you pay for (seats in the contract, or on the tool list) with who actually signs in,
so "cut seats" recommendations rest on real login data instead of guesses.

## Where the data comes from

The Google Workspace and Microsoft 365 / Entra ID connections on **Discovered tools** (see `docs/auto-discovery-setup.md`).
Each sync records, per app:

| Field | Google Workspace | Microsoft Entra ID |
| --- | --- | --- |
| People who signed in during the window | token + SAML logs, last 90 days | sign-in logs, last 30 days |
| Active: signed in during the last 30 days | yes | yes (the whole window) |
| Latest sign-in | yes | yes |
| Who went quiet (signed in, but not in 30 days) | up to 100 people | not available (30-day window) |

Without Entra ID P1/P2 Microsoft only says who is *assigned* to an app; those counts are not used for seat cuts.

Seat states shown everywhere: **active** (30 days), **inactive 30+ days** (seen in the window but not since), and
**no sign-in in N days** (paid seats nobody used during the whole window).

## Where it shows

- **Seats & usage**: every contract and tool with sign-in data, last sign-in, unused seats and their cost.
- **Savings** dashboard: a "Seats nobody used" number, and seat-cut opportunities sized from real unused seats.
- **Contract page** (uploaded contracts): seat usage card with the people to reclaim first; the seat saving uses the
  contract's seat-reduction clause as the limit (without one it shows "up to", since the vendor must agree); the
  "Cut seats" email asks for the exact seat count.
- **Leadership view**: a "Seats used" column; "Cut seats" when at least 2 seats and 10% of the contract went unused,
  never cutting below what the owning team said it needs in the survey.
- **Tool page**: the same seat usage card.

When a product is bought by two departments separately (e.g. Sales' Zoom and Operations' Zoom), each tool gets the
sign-ins of people in its own directory department. A contract linked to a tool uses that tool's numbers.

## Set up

1. Supabase → SQL editor → paste the whole of `supabase/migrations/20261116213000_seat_usage.sql` → Run.
   Until then, syncs and the demo workspace still work, just without login dates (active = signed in during the window).
2. Connect Google Workspace or Microsoft on **Discovered tools** (needs the OAuth keys, see `docs/auto-discovery-setup.md`).
3. Reset the demo workspace (Workspace settings) to load its sample login data.

Code: `src/lib/usage.ts` (matching and maths), `src/lib/useUsage.ts` (loading), `src/components/SeatUsage.tsx` (UI).
