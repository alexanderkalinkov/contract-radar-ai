# Billing setup (Stripe)

Companies can pay without talking to you: every new workspace gets a **14-day free trial** with Growth limits and no card.
An admin picks a plan on **Billing** in the sidebar, pays in Stripe Checkout, and manages the card, invoices, plan changes
and cancellation in the Stripe Customer Portal. When the trial (or a subscription) ends without payment, every page except
Billing and Workspace shows "Choose a plan", new uploads and invites are refused, and renewal reminders stop. Nothing is deleted.

Until `STRIPE_SECRET_KEY` is set, billing is **off**: no Billing page, nothing locked.

## Plans

| Plan | Monthly | Yearly (2 months free) | Contracts | People |
|---|---|---|---|---|
| Starter | €199 | €1,990 | 25 | 5 |
| Growth | €499 | €4,990 | 150 | 25 |
| Business | €999 | €9,990 | unlimited | unlimited |

Prices exclude VAT. They live in Stripe, found by lookup key (`cr_starter_month`, `cr_growth_year`, ...). To change a price,
create a new price on the product in Stripe and move the lookup key to it (tick "Transfer lookup key"). The app shows the new
amount straight away; existing subscribers keep their old price. Limits and feature lists are in `src/lib/billing/plans.ts`.

"People" counts members plus pending invites.

## One-time setup (test mode)

1. **Stripe account.** Sign up at https://dashboard.stripe.com/register. Bulgaria is supported. You can test right away; to take
   real money you activate the account later (see *Going live*).
2. **Database.** In the Supabase SQL editor, run the whole of
   [`supabase/migrations/20261116180000_billing.sql`](../supabase/migrations/20261116180000_billing.sql). It adds the
   `workspace_billing` table, starts a 14-day trial for every new workspace, and gives existing workspaces a fresh trial from today.
3. **Keys.** Stripe dashboard (test mode on) → *Developers → API keys* → copy the **Secret key** (`sk_test_...`) into
   `.env.local` as `STRIPE_SECRET_KEY`.
4. **Plans, portal and webhook.** On your Mac, in the project folder:
   ```bash
   npm install
   npm run stripe:setup -- https://outflow.radivarius.com
   ```
   It creates the 3 products and 6 prices, sets up the Customer Portal (switch plan, update card, invoices, cancel at period end)
   and a webhook to `/api/stripe/webhook`, then prints the webhook's signing secret (`whsec_...`). Safe to run again.
5. **Vercel.** *Project → Settings → Environment Variables*: add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then redeploy.
   `SUPABASE_SERVICE_ROLE_KEY` must also be set (it already is for reminders): the webhook uses it to save the plan.
6. **Try it.** Sign in as a workspace admin → *Billing* → *Choose Growth* → card `4242 4242 4242 4242`, any future date, any CVC.
   Back in the app the plan shows as active within a few seconds.

### Your own workspace

To keep your own workspace (or a pilot customer's) free with no limits, run in the SQL editor:

```sql
update public.workspace_billing set complimentary = true
where workspace_id = (select id from public.workspaces where name = 'Your workspace name');
```

### Testing the webhook locally

Install the Stripe CLI (`brew install stripe/stripe-cli/stripe`), then `stripe login` and
`stripe listen --forward-to localhost:3000/api/stripe/webhook`. Put the `whsec_...` it prints in `.env.local` as
`STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.

## How it works

- `workspace_billing` holds one row per workspace: trial end, Stripe customer and subscription, status, plan, period end.
  Members can read it; only the server (service role) writes it, so nobody can give themselves a plan from the browser.
- `POST /api/billing/checkout` (admins) creates the Stripe customer and a Checkout session. Subscribing during the trial keeps
  the remaining trial days: the card is charged when the trial ends. Companies can enter their VAT number and promotion codes.
- `POST /api/billing/portal` (admins) opens the Customer Portal.
- `POST /api/stripe/webhook` verifies Stripe's signature and, for checkout and subscription events, re-reads the subscription
  from Stripe and saves it. A failed card payment (`past_due`) keeps the workspace open with a warning while Stripe retries.
- `src/lib/server/billing.ts` turns the row into access and limits (`summarize`). Uploads, AI-drafted emails and invites check it.

## Going live

1. **Activate the account** (Stripe dashboard → *Activate payments*): business type (sole trader / ЕТ, or a company such as
   ЕООД), legal name and address, ЕИК/Bulstat if you have one, your ID for verification, a EUR bank account (IBAN) for payouts,
   a statement descriptor, and the public website URL. Stripe also expects the site to show prices, terms, a privacy policy,
   a refund/cancellation policy and contact details, so add those pages before going live.
2. **VAT.** Selling to EU businesses with a valid VAT number is usually reverse charge, and Checkout collects that number.
   Whether you charge Bulgarian VAT depends on your VAT registration: check with your accountant. Stripe Tax can calculate it
   (turn it on in the dashboard, then set `STRIPE_AUTOMATIC_TAX=true`).
3. Switch the dashboard to live mode, copy the live secret key, run `npm run stripe:setup -- <your real domain>` with it,
   and put the live `STRIPE_SECRET_KEY` and new `STRIPE_WEBHOOK_SECRET` in Vercel. Test mode and live mode are fully separate.
