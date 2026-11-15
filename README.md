# Contract Radar AI

AI contract radar and price-increase tracker that helps mid-market companies cut SaaS spend.
The buyer is the CFO, VP Finance or procurement lead.

This is the **first clickable version**: the screens from the dashboard spec, running on seeded sample data for a
fictional company (Northwind Logistics), with stubbed connectors. One piece is real AI: upload a contract PDF and
Claude extracts the notice date, auto-renewal, uplift cap and other renewal terms, quoting the clause behind each one.

![Savings dashboard](docs/screenshots/dashboard.png)

## Run it locally

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/alexanderkalinkov/contract-radar-ai.git
cd contract-radar-ai
npm install
npm run dev
```

Open http://localhost:3000.

### Turn on real contract extraction (optional)

Without an API key the upload screen runs in **demo mode** and returns sample results, so everything stays clickable.
To have Claude read your own PDFs:

```bash
cp .env.example .env.local
# then edit .env.local and set ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Get a key at https://platform.claude.com/. Each contract costs a few cents to read.

## What to click

| Screen | URL | What works |
|---|---|---|
| Savings dashboard | `/` | Sort and filter opportunities, "⋯" menu to mark won, snooze or dismiss (KPIs update), urgent banner, lever bars filter the table, weekly digest preview |
| Contract renewal detail | `/contracts/salesforce` (and every other vendor) | Renewal math with "What to ask for" toggle, extracted clauses with page and confidence, seat usage, pushback email with Firm/Friendly tone, open in email, copy, mark as sent |
| Contracts | `/contracts` | All contracts by notice deadline, plus the ones you uploaded |
| Upload contract | `/upload` | Real Claude extraction from a PDF. Click "Try the sample Acme Analytics MSA" if you have no contract handy |
| Onboarding | `/welcome` | First-login flow: free 3-contract audit, connect logins and spend (simulated), "Found so far" counter |
| Renewal calendar, Seats & usage, Price changes, Sources | sidebar | Read-only views over the same sample data |

Clicks are remembered in your browser (localStorage). "Reset demo" under the opportunities table clears them.

## How it's built

- [Next.js 15](https://nextjs.org/) (App Router) + TypeScript + [Tailwind CSS 4](https://tailwindcss.com/)
- [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) with structured outputs (Zod schema) for extraction
- No database yet. Sample data lives in code.

```
src/
  app/
    (app)/            screens that share the sidebar: dashboard, contracts, calendar, seats, price changes, sources, upload
    welcome/          onboarding (no sidebar)
    api/extract/      POST a PDF → Claude → structured renewal terms
  components/         Dashboard, ContractDetail, ConnectSources, Uploader, shared UI
  lib/
    seed.ts           sample company, contracts, opportunities, sources  ← edit this to change the demo data
    engine.ts         date maths (act-by = term end − notice days), renewal math, pushback email template
    extraction.ts     the Zod schema Claude fills in, plus the demo-mode result
    store.ts          tiny localStorage store standing in for a backend
public/samples/       fictional sample contract for trying the upload
scripts/              regenerates the sample PDF
docs/screenshots/     screenshots used in this README and the PR
```

The product spec is in `docs/dashboard-spec.md` (PR #1).

## What's real and what's stubbed

| Piece | Status |
|---|---|
| Contract PDF extraction | **Real** (Claude, with an API key). Demo result without one |
| Notice deadlines, renewal math, savings per lever | Real calculations, run over sample data |
| Pushback email | Template filled from the contract data. Next step: have Claude draft it from the clauses |
| Google Workspace, Microsoft 365, Okta, QuickBooks, Xero, cards | Simulated connect buttons |
| Users, accounts, database, weekly digest sending | Not built yet |
| "Today" | Fixed to Nov 15, 2026 in `src/lib/engine.ts` so the sample deadlines always read the same |

## Scripts

```bash
npm run dev     # dev server on :3000
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Deploying a preview

The app deploys to [Vercel](https://vercel.com/new) as-is: import the GitHub repo, add `ANTHROPIC_API_KEY` as an
environment variable if you want real extraction, and every pull request gets its own preview URL.
