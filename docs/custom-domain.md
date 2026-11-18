# Custom domain: outflow.radivarius.com

Contract Radar lives at **https://outflow.radivarius.com**. The apex `radivarius.com` and every other
subdomain stay free for other projects: everything below only touches names under `outflow.`
(plus one optional DMARC record on the apex that covers all subdomains).

What the code does for you (PR "Move app to outflow.radivarius.com"):

- Once `APP_URL` is the new address, page views on `contract-radar-ai.vercel.app` redirect (308) to the same
  path on the new domain. API calls, webhooks and `/auth/*` sign-in links are *not* redirected, so Stripe,
  Resend, cron and half-finished sign-ins keep working on the old address until you re-point them.
  Other old hosts: `OLD_APP_HOSTS` (comma separated).
- `INBOUND_EMAIL_OLD_DOMAINS` keeps old email-in addresses delivering after you move the inbox domain.
- Every link in emails, Stripe redirects, OAuth redirect URLs and legal pages come from `APP_URL`.

Sessions are per domain, so everyone signs in once more on the new address. Nothing in the database changes.

## Do it in this order

### 1. Point the subdomain at Vercel (registrar + Vercel)

1. Vercel → project **contract-radar-ai** → **Settings → Domains → Add** → `outflow.radivarius.com`
   → connect it to **Production**. Do **not** pick "Redirect to" and do **not** move the whole domain to Vercel's
   nameservers (that would take over the apex and your other subdomains).
2. Vercel shows one **CNAME** record. At your registrar's DNS page for `radivarius.com` add it:

   | Type | Name / Host | Value |
   |---|---|---|
   | CNAME | `outflow` | the value Vercel shows (e.g. `cname.vercel-dns.com` or a `….vercel-dns-0xx.com` name) |

   Some registrars want the full name `outflow.radivarius.com` in the host box; most want just `outflow`.
3. Wait until Vercel shows **Valid Configuration** (minutes, sometimes up to an hour). Vercel issues the HTTPS
   certificate by itself. Open https://outflow.radivarius.com: the site already works on both addresses.

### 2. Supabase sign-in addresses

Supabase → project **contract-radar** → **Authentication → URL Configuration**:

- **Site URL**: `https://outflow.radivarius.com` (email templates use it for the logo and links).
- **Redirect URLs**: add `https://outflow.radivarius.com/**`. Keep `http://localhost:3000/**`. Keep
  `https://contract-radar-ai.vercel.app/**` for about a week so emails sent before the switch still work,
  then delete it.

### 3. Switch the app address (Vercel env vars)

Vercel → **Settings → Environment Variables** (Production):

- `APP_URL` = `https://outflow.radivarius.com`

Then **Deployments → ⋯ → Redeploy** the latest production deployment. From now on the old address forwards
people to the new one. Also change `APP_URL` in `.env.local` on the Mac.

### 4. Re-point the webhooks

- **Stripe** (test mode now, live later): Dashboard → **Developers → Webhooks** → the Contract Radar endpoint →
  **⋯ → Update details** → URL `https://outflow.radivarius.com/api/stripe/webhook`. Editing keeps the same signing
  secret, so `STRIPE_WEBHOOK_SECRET` stays. (When you go live, run
  `npm run stripe:setup -- https://outflow.radivarius.com` with the live key, as in docs/billing-setup.md.)
  Also put `https://outflow.radivarius.com` as the business website in Stripe → Settings → Business details;
  it helps the verification that billing is waiting on.
- **Resend inbound webhook**: Resend → **Webhooks** → the `email.received` webhook → edit the endpoint to
  `https://outflow.radivarius.com/api/inbound/resend`. The signing secret stays.

### 5. Send email from the new domain (Resend)

Use the subdomain `outflow.radivarius.com` as the sending domain, so other projects can have their own.

1. Resend → **Domains → Add domain** → `outflow.radivarius.com` (region EU is fine).
2. Add the records Resend shows at your registrar. They look like this (copy the exact values from Resend):

   | Type | Name / Host | Value |
   |---|---|---|
   | TXT | `resend._domainkey.outflow` | `p=MIGf…` (DKIM key) |
   | MX | `send.outflow` | `feedback-smtp.<region>.amazonses.com`, priority 10 |
   | TXT | `send.outflow` | `v=spf1 include:amazonses.com ~all` |

   Optional but recommended, once for the whole domain: TXT `_dmarc` → `v=DMARC1; p=none;`
3. Click **Verify** and wait for **Verified**.
4. Vercel env: `EMAIL_FROM` = `Contract Radar <alerts@outflow.radivarius.com>`. Redeploy.
5. Supabase → **Authentication → Emails → SMTP Settings** → Sender email `alerts@outflow.radivarius.com`
   (the Resend SMTP password stays the same).
6. Keep `degenbuddies.com` verified in Resend until you have seen a reminder and an invite arrive from the new
   address.

Replies: `EMAIL_REPLY_TO`, `SUPPORT_EMAIL` and `LEGAL_EMAIL` must be mailboxes you actually read. Keep your
current ones, or set up forwarding at the registrar (for example `support@radivarius.com` → your inbox) and use that.

### 6. Optional: email-in addresses on your domain

Today workspace inboxes are `<name>.<token>@vexbata.resend.app`, which works fine. To move them:

1. Resend → **Domains → Add domain** → `in.outflow.radivarius.com` → turn on **Receiving**.
2. Add the **MX** record Resend shows for `in.outflow` at the registrar (it must be the only/lowest MX for that name).
3. Vercel env: `INBOUND_EMAIL_DOMAIN` = `in.outflow.radivarius.com` and
   `INBOUND_EMAIL_OLD_DOMAINS` = `vexbata.resend.app`. Redeploy. Old addresses keep working; Settings shows the new one.

### 7. Connectors (separate step)

QuickBooks, Xero, Google, Microsoft, Drive and SharePoint register redirect URIs like
`https://outflow.radivarius.com/api/connect/<provider>/callback`. Follow docs/auto-discovery-setup.md with the
new domain.

### 8. Check it

- https://outflow.radivarius.com loads with a padlock; https://contract-radar-ai.vercel.app/ forwards there.
- Sign in, request a password reset: the link in the email opens outflow.radivarius.com.
- Platform admin → Setup & health shows APP_URL and EMAIL_FROM as set.
- Stripe → webhook endpoint → **Send test event** answers 2xx.
