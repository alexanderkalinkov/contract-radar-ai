# Email contracts in

Every workspace gets its own inbox address, shown in **Workspace settings → Email contracts in** and under the
uploader:

```
northwind-logistics.k3x9q2m7ab@<INBOUND_EMAIL_DOMAIN>
```

Anyone in the workspace can forward a vendor's email, or send a PDF or Word (.docx) contract, to that address.
Claude reads each attachment exactly like an upload, the contract is saved with the sender as the uploader, a
suggested tool is filed under the sender's department, and the sender gets a reply listing what was added (with
notice deadlines) and anything that was skipped.

## How it works

1. Resend receives the mail for the inbox domain and calls `POST /api/inbound/resend` with an `email.received`
   webhook (metadata only).
2. The app checks the Svix signature, records the email id (so Resend's retries are ignored), answers 200 and does
   the rest in the background.
3. It finds the workspace from the 10-character token after the last dot in the address. The name part is only for
   people, so renaming the workspace never breaks a saved address.
4. It fetches the email from Resend's API and only continues when:
   - the From address belongs to a **member of that workspace**, and
   - the sender's mail server **authenticated** the From address (DMARC pass, or no DMARC policy and an aligned DKIM
     pass). This stops someone typing a colleague's address into From.
   People outside the workspace get no reply (their address could be forged). Members whose email fails the check
   get a reply at their real address explaining what happened and pointing to the Upload page.
5. Each PDF or .docx attachment (up to 10 per email, 20 MB each) is downloaded, read by Claude, saved to the private
   `contracts` bucket and to `contracts` (with `source = 'email'`), and added to Tools as unconfirmed. Plan limits
   apply the same way as uploads. Inline images, old `.doc` files and other files are skipped.
6. Every email is logged in `inbound_emails` and the last 10 show in Workspace settings.

Word files are converted to text first, so their extracted clauses have no page numbers.

## Setup

### 1. Run the SQL

Open the Supabase SQL editor and run the whole of
[`supabase/migrations/20261116210000_email_inbox.sql`](../supabase/migrations/20261116210000_email_inbox.sql).
It adds the inbox token to every workspace, the `inbound_emails` log, `contracts.source`, and lets the bucket hold
.docx files. Safe to run again.

### 2. Turn on receiving in Resend

You can start right away on Resend's own receiving domain and move to your real domain later. Only
`INBOUND_EMAIL_DOMAIN` changes.

- **Now (dummy domain):** Resend dashboard → **Emails → Receiving** → ⋯ → **Receiving address**. It looks like
  `<id>.resend.app`. Every address at it reaches you, so use that whole domain as `INBOUND_EMAIL_DOMAIN`.
- **Later (real domain):** use a subdomain such as `in.yourdomain.com` so it doesn't clash with your normal mailbox.
  Add it under **Domains**, turn on **Receiving**, and add the MX record exactly as Resend shows it (it must be the
  lowest priority MX for that subdomain). Then set `INBOUND_EMAIL_DOMAIN=in.yourdomain.com`.

Changing the domain changes everyone's inbox address, so tell the team when you switch.

### 3. Add the webhook

Resend dashboard → **Webhooks → Add webhook**:

- Endpoint: `https://<your app>/api/inbound/resend` (now `https://contract-radar-ai.vercel.app/api/inbound/resend`)
- Event: `email.received`

Open the webhook and copy its **signing secret** (`whsec_…`).

### 4. Environment variables (Vercel → Settings → Environment Variables, and `.env.local`)

| Variable | Value |
|---|---|
| `INBOUND_EMAIL_DOMAIN` | `<id>.resend.app` now, `in.yourdomain.com` later |
| `RESEND_WEBHOOK_SECRET` | the webhook's signing secret |
| `RESEND_INBOUND_API_KEY` | a Resend API key with **Full access** (reading received mail needs it). Leave empty only if `RESEND_API_KEY` already has full access |
| `SUPABASE_SERVICE_ROLE_KEY` | already set for reminders |
| `ANTHROPIC_API_KEY` | already set (without it, emailed contracts get the sample extraction) |
| `INBOUND_TRUST_UNVERIFIED_SENDERS` | optional, `true` skips the SPF/DKIM/DMARC check. Leave it off in production |

Redeploy after adding them.

### 5. Try it

Open **Workspace settings**, copy the address, and email it a contract PDF from the address you sign in with. Within
a minute or so you get a reply, the contract shows on the Contracts page, and the email appears under "Recently
received". Preview the reply at `/api/email-preview?t=inbox-receipt`.

If nothing arrives, check in this order: Resend → Emails → Receiving (did the mail arrive?), Resend → Webhooks →
your webhook's deliveries (did the app answer 200?), then "Recently received" in Workspace settings for the reason.

## Changing the address

Admins can click **Get a new address** in Workspace settings if the address leaks. The old one stops working at
once. Members can't change the token themselves (a database trigger blocks it).
