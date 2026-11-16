# Auto-discovery: setup

Auto-discovery finds the tools a company pays for and uses:

- **QuickBooks Online or Xero**: recurring software vendors and the last 12 months of spend (bills, card and bank expenses).
- **Google Workspace or Microsoft 365 / Entra ID**: which apps people sign in to with company SSO, how many people, and which department they sit in. Also Google Workspace and Microsoft 365 licence counts.

Each tool is pre-assigned to a department (by where its users sit, or who usually owns that kind of tool), the admin
reviews the list on **Discovered tools** (`/discover`, also step 2 and 5 of `/setup`), and **Add to Tools & survey**
sends each one to its department owner, who confirms it and answers the 4 questions.

Everything is read-only. We never write to QuickBooks, Xero, Google or Microsoft.

## What you set up once

You register one OAuth app per provider for Contract Radar (not one per customer). Each gives you a **client ID** and a
**client secret**. Put them in `.env.local` for local runs and in Vercel for the live site. You only need the providers
you want; the others show "Needs setup".

Register **both** redirect URLs with every provider:

```
http://localhost:3000/api/connect/<provider>/callback
https://contract-radar-ai.vercel.app/api/connect/<provider>/callback
```

where `<provider>` is `quickbooks`, `xero`, `google` or `microsoft`.

### 0. Run the SQL and set the encryption key

1. Supabase → **SQL Editor → New query**, paste all of
   [`supabase/migrations/20261116000000_auto_discovery.sql`](../supabase/migrations/20261116000000_auto_discovery.sql), click **Run**.
   Safe to run again.
2. Make an encryption key for the stored sign-in tokens. In Terminal: `openssl rand -base64 32`. Add it as
   `CONNECTOR_ENCRYPTION_KEY=...`. Use the same value locally and on Vercel, and don't change it later (changing it
   means everyone reconnects).

### 1. QuickBooks Online (about 10 minutes)

1. Go to https://developer.intuit.com, sign in, **Dashboard → Create an app → QuickBooks Online and Payments**.
2. Scope: **com.intuit.quickbooks.accounting**.
3. **Keys & credentials** (Development): add the two redirect URIs above with `quickbooks`.
4. Copy **Client ID** and **Client Secret** into `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET`.
5. Leave `QUICKBOOKS_ENVIRONMENT=sandbox` to test against Intuit's sample company (create one under **Sandbox**).
   For real customers, fill in Intuit's production questionnaire, switch to the production keys and set
   `QUICKBOOKS_ENVIRONMENT=production`. Production redirect URIs must be https, so test production on the Vercel URL.

### 2. Xero (about 5 minutes)

1. Go to https://developer.xero.com/app/manage → **New app** → **Web app**.
2. Company or application URL: `https://contract-radar-ai.vercel.app`. Redirect URI: the `xero` URLs above (add the second one after creating).
3. **Configuration → Generate a secret**. Copy the client ID and secret into `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`.
4. The free Starter tier allows 5 connected organisations, plenty for testing.

### 3. Google Workspace (about 15 minutes)

1. Go to https://console.cloud.google.com → create a project (e.g. "Contract Radar").
2. **APIs & Services → Library**: enable **Admin SDK API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform): app name, support email, audience **External**.
   Add scopes `admin.reports.audit.readonly` and `admin.directory.user.readonly`. While the app is in testing, add your
   own Google admin account under **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Authorised redirect URIs: the two `google` URLs.
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. Connect with a **super admin** of the Workspace. Before real customers, submit the app for Google verification
   (these scopes are not restricted, so no paid CASA assessment).

### 4. Microsoft 365 / Entra ID (about 10 minutes)

1. Go to https://entra.microsoft.com → **App registrations → New registration**.
2. Supported account types: **Accounts in any organizational directory (Multitenant)**. Redirect URI: **Web**, the `microsoft` URL for localhost; add the Vercel one under **Authentication** afterwards.
3. **Certificates & secrets → New client secret**. Copy the secret **Value** (not the ID) into `MICROSOFT_CLIENT_SECRET`, and the **Application (client) ID** from Overview into `MICROSOFT_CLIENT_ID`.
4. **API permissions → Add → Microsoft Graph → Delegated**: `User.Read.All`, `AuditLog.Read.All`, `Directory.Read.All`, `offline_access`.
5. Connect with a **Global Administrator** (or one who can grant admin consent). Sign-in logs need Entra ID P1 or P2; without it Radar counts who is assigned to each app instead and says so.

### 5. Put the keys in

`.env.local` on your Mac (open it with `open -e .env.local` in the project folder):

```bash
CONNECTOR_ENCRYPTION_KEY=...
QUICKBOOKS_CLIENT_ID=...
QUICKBOOKS_CLIENT_SECRET=...
QUICKBOOKS_ENVIRONMENT=sandbox
XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
```

Restart `npm run dev`. On Vercel: **Project → Settings → Environment Variables**, add the same names, then
**Deployments → ⋯ → Redeploy**.

Optional: `APP_URL=https://contract-radar-ai.vercel.app` forces the redirect URL base (useful behind a custom domain).
`ANTHROPIC_API_KEY`, which you already have, lets Claude clean up vendor names and drop non-software spend.

## How it works

| Piece | File |
|---|---|
| Connect, sync now, disconnect | `src/app/api/connect/[provider]/route.ts` |
| OAuth return, first sync | `src/app/api/connect/[provider]/callback/route.ts` |
| Provider API calls (read-only, capped per sync) | `src/lib/server/connectors/fetchers.ts` |
| Token encryption, scopes, endpoints | `src/lib/server/connectors/config.ts`, `oauth.ts` |
| Vendor catalogue and name matching (~120 SaaS vendors) | `src/lib/discovery/catalog.ts` |
| Recurring-spend detection, merging sources, department suggestion | `src/lib/discovery/build.ts` |
| Claude for unknown vendor names | `src/lib/server/connectors/classify.ts` |
| Review list and import into tools | `src/app/api/discovery/route.ts`, `src/components/discovery/Discovery.tsx` |

**Department suggestion**, in order: an admin's choice; the department most of the tool's users sit in (from the
Google or Microsoft directory, if 50%+ are in one); the department that usually owns that kind of tool (catalogue or
Claude); company-wide tools (Slack, Zoom, Google Workspace…) go to IT, else Operations or Finance; otherwise unassigned.

**Tables**: `connections` (status, no secrets), `connection_secrets` (encrypted tokens, admins only),
`discovery_signals` (what each source found, rebuilt each sync), `discovered_tools` (the admin's review decisions).

**Not built yet**: a daily background sync (admins press *Sync now*; a cron needs the Supabase service role key),
Okta, Ramp/Brex, CSV upload. Nango (integration plan §2) can replace the OAuth plumbing later without touching the
review flow.
