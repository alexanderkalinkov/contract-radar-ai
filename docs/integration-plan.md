# Data Integration Plan

Status: draft for review
Owner: Alex
Last updated: 2026-11-15
Related: [Savings Dashboard spec](dashboard-spec.md) (PR #1). Entity names (`contract`, `usage`, `spend_line`, `quote`, `pricing_snapshot`, `opportunity`) and lever names match §4 of that spec.

---

## 1. Principles

- **Read-only, always.** Every connector asks for the narrowest read scope that works. We never write to a customer's systems. This is the first line of the trust note on the Connect screen and the first thing a security reviewer checks.
- **OAuth, never passwords.** The customer clicks **Connect**, signs in at the provider, and approves access. We store encrypted refresh tokens only. Where a provider offers admin-consent or service-to-service access (Okta API service integrations, Microsoft application permissions), we use that so the connection does not break when one employee leaves.
- **Metadata over content.** For identity sources we read sign-in dates and license counts, not email or files. For email we read only messages that match contract patterns (§3.3), and we prefer a forwarding address, which needs no mailbox access at all.
- **Every number keeps its evidence.** Each record stores the source system, the source record ID and the sync time, so the dashboard can show where a figure came from (spec §1, "Show the evidence") and mark it stale when a source stops syncing (spec §5.5).
- **Each source unlocks a lever.** We build connectors in the order that unlocks the most savings per week of engineering work.

### Which source unlocks which lever

| Lever (spec §4) | Needs | Fills entities |
|---|---|---|
| Missed auto-renewal avoided, notice deadlines | Contracts | `contract` |
| Price increase over cap | Contracts + renewal quote | `contract`, `quote` |
| Unused seats | Contracts (seat count, price, reduction allowance) + identity or vendor usage | `contract`, `usage` |
| Duplicate tools | Spend (+ identity to see who uses which) | `spend_line`, `vendor`, `usage` |
| Terms / pricing change | Public pricing and ToS pages | `pricing_snapshot` |
| KPI tile 4 "Contracts tracked" | Spend + identity (to count apps), contracts (to count coverage) | `vendor`, `contract` |

---

## 2. Unified API or build it ourselves?

| Option | What it gives us | Fit for us | Cost (published, Nov 2026) |
|---|---|---|---|
| **Merge** (merge.dev) | One normalised API per category: Accounting, File storage, HRIS, CRM, ATS, Ticketing. | Good for **accounting** (QuickBooks, Xero, NetSuite, Sage behind one schema) and **file storage** (Drive, SharePoint, Dropbox, Box). Does **not** cover identity sign-in logs or SaaS vendor admin APIs, which are our core usage data. | Free for 3 linked accounts; Launch $650/mo for 10 production linked accounts, then $65 per account. Rate limit 100/min on Launch. |
| **Nango** (nango.dev) | Managed OAuth, token refresh, and sync scripts we write ourselves, for 1,200+ APIs. Open source and self-hostable. | Good for the **long tail**: Okta, Microsoft Graph, Slack, Zoom, Salesforce, HubSpot. We keep control of the data model; Nango removes the OAuth and refresh plumbing. | Free tier (10 connections). Pay-as-you-go $50/mo + $0.29 per connection + compute and data. |
| **Build directly** | Full control, no per-account fee. | Needed anyway for Google Workspace (domain-wide data, Marketplace listing) and for email. | Engineering time, plus each provider's own fees (§3.2). |

**Recommendation**

1. **Nango for OAuth and sync plumbing on every connector**, including the ones we write ourselves. At 50–1,000 employee customers with 3–6 connections each, Nango's per-connection price stays low, and it avoids rebuilding token refresh, retries and webhooks per provider.
2. **Build QuickBooks and Xero directly (on Nango auth) for the MVP.** Two accounting systems do not justify Merge's $650/mo floor yet. Revisit Merge Accounting when customers ask for NetSuite, Sage Intacct or Dynamics, which mid-market finance teams do use.
3. **Never depend on a unified API for identity data.** It is our core moat (unused seats) and no unified provider normalises sign-in logs well.

Whatever we choose, connectors write into **our** entities (`usage`, `spend_line`, `contract`), so we can swap the transport later without touching the opportunity engine.

---

## 3. Connectors

Each connector lists: auth, scopes, data, which dashboard features it feeds, limits and gotchas, and the security review needed. Facts were checked against provider docs on 2026-11-15; items marked **(verify)** could not be confirmed from an official page and must be checked before building.

### 3.1 Identity and usage: "who actually logs in"

#### Google Workspace (MVP)

| | |
|---|---|
| **Auth** | OAuth 2.0, approved by a Workspace super admin. Distribute as a Google Workspace Marketplace app so the admin can install it for the whole domain. |
| **Scopes** | `https://www.googleapis.com/auth/admin.reports.audit.readonly` (audit logs), `admin.directory.user.readonly` (user list, suspended status, last login), optionally `apps.licensing` read for Google's own SKUs. All are admin scopes; none are Gmail or Drive content scopes. |
| **Data** | Reports API `applicationName=login` (Google sign-ins and SAML SSO logins), `saml` (sign-ins to third-party SAML apps where Google is the IdP) **(verify app name)**, `token` (third-party apps users granted OAuth access to, i.e. "Sign in with Google" apps and shadow IT). Directory API: user list, `lastLoginTime`, suspended and archived users. |
| **Feeds** | `usage` (active users per app over 30/60/90 days, never signed in); `vendor` discovery for KPI tile 4; Seats & usage page; renewal detail §6.5 "Seat usage". |
| **Limits & gotchas** | Login, SAML and OAuth token logs are kept for **6 months** and the API can query up to 180 days back. Login and SAML events lag a few minutes; token events lag a few hours. Only apps that use Google as their sign-in are visible: an app with its own username and password is invisible here, so vendor APIs (§3.1 last row) fill the gap. Backfill 90 days on connect so the "inactive 60+ days" number is right on day one. |
| **Security review** | Admin Reports and Directory scopes are not on Google's restricted list, so no CASA assessment. Still needs Google OAuth app verification (brand, privacy policy, domain) and a Marketplace listing review. |

#### Microsoft 365 / Entra ID (Phase 2)

| | |
|---|---|
| **Auth** | Multi-tenant Entra app, **application permissions with admin consent** (client credentials), so the connection is not tied to one user. |
| **Scopes** | `AuditLog.Read.All` (sign-in logs and `signInActivity`), `User.Read.All`, `Application.Read.All` (enterprise apps / service principals), `Directory.Read.All` for license SKUs (`subscribedSkus`). |
| **Data** | `GET /auditLogs/signIns` (per-sign-in records including the app), `user.signInActivity` (`lastSuccessfulSignInDateTime`, the field Microsoft recommends for "when was this account truly used"), enterprise app assignments, M365 license counts. |
| **Feeds** | Same as Google: `usage`, `vendor` discovery, Seats & usage. Also covers Microsoft's own licenses (E3/E5, Copilot), often a large unused-seat line. |
| **Limits & gotchas** | Sign-in logs are kept only for the Entra default retention period: 30 days with Entra ID P1/P2 and 7 days on free tenants **(verify against Microsoft's retention page)**. So we must **sync daily and keep our own history** to compute 60/90-day activity. `signInActivity` is kept for the life of the user and is the best fallback, but `lastSuccessfulSignInDateTime` only exists from Dec 2023 onwards and is not backfilled. Reading sign-in data likely requires Entra ID P1 or P2 on the customer tenant **(verify)**: show a clear message if the tenant lacks it. Pages are capped at 1,000 records; always filter by time range or requests time out. |
| **Security review** | Microsoft **publisher verification** (Microsoft AI Cloud Partner Program ID) so the consent screen does not show "unverified". Optional later: Microsoft 365 App Compliance / Publisher Attestation, which some IT teams ask for. |

#### Okta (Phase 2)

| | |
|---|---|
| **Auth** | Okta Integration Network (OIN) **API service integration**: OAuth 2.0 client credentials, no user tied to the connection. The customer's Okta admin installs it from the OIN catalogue. **(verify the exact setup flow in Okta's OIN API service guide)** |
| **Scopes** | `okta.logs.read` (System Log), `okta.apps.read` (app catalogue and assignments), `okta.users.read`. |
| **Data** | System Log `GET /api/v1/logs` filtered to app SSO events **(verify event type names in the Event Types catalogue)**; app list with assigned users and groups. |
| **Feeds** | `usage` and `vendor`. Okta is often the most complete map of a mid-market company's apps, so it is the strongest source for KPI tile 4. |
| **Limits & gotchas** | Okta keeps **90 days** of System Log. Query with `since`/`until` and the `after` cursor, `limit` up to 1,000 per page. Rate limits are per endpoint bucket per minute and return 429; exceeding them also writes a warning into the customer's own System Log, which their admin will see, so stay well under. Backfill the full 90 days on connect, then sync incrementally every few hours. |
| **Security review** | OIN submission and review by Okta. No paid assessment, but Okta checks the integration and docs. |

#### SaaS vendor admin APIs (Phase 3)

The most accurate seat data, because it is the vendor's own count of paid versus active seats. It also covers apps with their own logins that identity sources cannot see. One connector per vendor, so build the top 10–15 by customer spend first, and use Nango for the OAuth.

| Vendor | Endpoint / object | Scope / access | Notes |
|---|---|---|---|
| Slack | `team.billableInfo` (who is billed, `billing_active`), `team.accessLogs` (last access per user) | User token with `admin` scope; workspace admin must install | `accessLogs` needs a paid plan. Billable info is computed periodically, not real time. Tier 2 rate limits. Plan a Slack Marketplace listing, since Slack applies tighter limits to unlisted apps on some methods. |
| Zoom | Users API (`last_login_time`), account plan / license counts | OAuth app, admin-level user read scopes | **(verify field and scopes)** |
| Salesforce | `UserLicense` (`TotalLicenses`, `UsedLicenses`), `User.LastLoginDate`, `LoginHistory` | Connected app / External Client App, `api` scope, admin user | **(verify)** Also the single largest renewal for many customers, so worth doing early in this phase. |
| HubSpot | Users and seats via settings APIs | Private or public app with user read scopes | **(verify)** |
| Atlassian, Notion, Adobe, Asana, Monday.com and others | Admin user lists with last-active dates | Per vendor | Pick by customer spend data once Phase 1 is live. |

### 3.2 Spend: "what they pay and to whom"

#### QuickBooks Online (MVP)

| | |
|---|---|
| **Auth** | OAuth 2.0 via Intuit. Access token lasts 1 hour. Refresh tokens rotate: store the new refresh token returned on every refresh, or the connection dies. |
| **Scopes** | `com.intuit.quickbooks.accounting`. There is no read-only variant, so we enforce read-only in our own code and say so on the consent screen. |
| **Data** | `Vendor`, `Bill`, `BillPayment`, `Purchase` (card and cash expenses), `Account` (to spot "Software/Subscriptions" expense accounts). Pull 13 months to see annual renewals. |
| **Feeds** | `spend_line`, `vendor`; Duplicate tools lever; finds apps with no contract (KPI tile 4); "Spend under management" card. |
| **Limits & gotchas** | 500 requests/min per company (realm) and 10 concurrent requests; 429 on breach. Since the Intuit App Partner Program (live July 2025), **read calls ("CorePlus") are metered**: the free Builder tier includes 500,000 reads/month and then **hard-blocks**; Silver is $300/mo for 1M. Use Change Data Capture and incremental queries rather than full re-reads. Vendor names are messy ("SLACK T0123 DUBLIN", "Amazon Web Services EMEA"), so the AI vendor matcher (§4) is required. |
| **Security review** | Intuit app assessment questionnaire before production keys, plus listing review if we publish on the QuickBooks App Store. |

Source on pricing and limits: third-party summaries of the Intuit App Partner Program **(verify on developer.intuit.com before choosing a tier)**.

#### Xero (MVP)

| | |
|---|---|
| **Auth** | OAuth 2.0. Apps created on or after 2 March 2026 **must use granular scopes**; the broad `accounting.transactions` scope is deprecated for everyone on 13 September 2027. |
| **Scopes** | `accounting.invoices.read` (bills are `ACCPAY` invoices), `accounting.payments.read`, `accounting.banktransactions.read` (card and bank spend not entered as bills), `accounting.contacts.read` (vendors), `offline_access`. Do **not** request journals: it needs the Advanced partner tier plus certification. |
| **Data** | Bills, payments, bank transactions, contacts. Pull 13 months. |
| **Feeds** | Same as QuickBooks. |
| **Limits & gotchas** | 5,000 calls/day per organisation on paid partner tiers (1,000/day on free Starter), plus per-minute limits **(verify)**. Xero partner tiers are priced by **number of connected organisations**: Starter 5 (free), Core 50 (A$35/mo), Plus 1,000 (A$245/mo). Starter is enough for pilots; budget Core at launch. Refresh tokens expire if unused **(verify lifetime)**, so a daily sync keeps them alive. Use `If-Modified-Since` for incremental syncs. |
| **Security review** | Xero App Partner certification to be listed in the Xero App Store; required to go beyond the connection limits of the free tier **(verify)**. Read Xero's developer terms on data use before using any Xero data for model training. |

#### Corporate cards and spend platforms (Phase 2)

| Source | Access | Data | Notes |
|---|---|---|---|
| Ramp | OAuth developer API, read scopes for transactions and merchants | Card transactions, merchant names, receipts | **(verify scopes)** Ramp already tags SaaS merchants, which helps matching. |
| Brex | OAuth / API token, read transactions | Card transactions, vendors | **(verify)** |
| Amex, bank cards | **CSV upload** first | Statement lines | Corporate card APIs for Amex are partner-only; CSV is the realistic path. Same import works for any bank. |
| CSV (any) | Upload | Date, merchant, amount | Ships in the MVP as the fallback for every spend source. |

Card spend matters because a lot of SaaS is bought on cards by team leads and never appears as a bill. It is the main source of duplicate tools and shadow IT.

### 3.3 Contracts: "the actual terms"

#### Upload (MVP, the free 3-contract audit)

| | |
|---|---|
| **Auth** | None beyond our own login. |
| **Data** | PDF, DOCX, scanned images. Order forms, MSAs, renewal quotes, signed amendments. |
| **Feeds** | `contract`, `quote`; every lever; renewal detail page; KPI tile 4. |
| **Pipeline** | Store in encrypted object storage → text extraction with OCR fallback → AI extraction of: term start/end, auto-renew, renewal term, notice period, uplift cap, seat-reduction allowance, annual fee, seat count and price → each field stores page, quoted text and confidence (spec §4) → low confidence goes to review mode (spec §5.5). Show live progress (spec §5.1). |
| **Gotchas** | One vendor often has several documents (MSA + order forms + amendments). The latest signed order form wins on price and seats; the MSA usually holds notice and auto-renew terms. Link documents to one `contract`. |

#### Email forwarding address (MVP)

| | |
|---|---|
| **Auth** | None. Each customer gets an address such as `contracts@{company}.radar…` (domain to be chosen). Customers forward order forms, invoices and renewal notices, or set an auto-forward rule in Gmail/Outlook for messages from known vendors. |
| **Data** | Email body and attachments, from inbound mail processing (e.g. a provider's inbound parse webhook). |
| **Feeds** | `quote` (renewal quotes that trigger the Price increase lever), `contract`, renewal notices with dates. |
| **Gotchas** | Verify the sender is from the customer's domain (SPF/DKIM) to block spam and spoofing. Deduplicate the same invoice forwarded twice. This path needs **no Google or Microsoft review**, which is why it is in the MVP instead of mailbox access. |

#### Mailbox search: Gmail and Outlook (Phase 3)

| | |
|---|---|
| **Auth** | Gmail: OAuth, `gmail.readonly`. Outlook: Microsoft Graph `Mail.Read` (delegated, one mailbox such as finance@ or ap@). |
| **Data** | Search for vendor invoices, order forms, "your subscription will renew" notices; fetch only matching messages and attachments. |
| **Gotchas & review** | `gmail.readonly` and `gmail.metadata` are **restricted scopes**. Production use needs Google verification plus a **CASA Tier 2 security assessment** by a Google-approved assessor, **renewed every year**. Third-party guides put assessor fees at roughly $540–$3,000+ and timing at 2–6 weeks. Do this only once customers ask for it; forwarding covers most of the value. Outlook `Mail.Read` needs Microsoft publisher verification and admin consent, but no paid assessment. |

#### Document storage and e-signature (Phase 3)

| Source | Access | Review | Notes |
|---|---|---|---|
| Google Drive | Prefer `drive.file` with the Google Picker: the user picks the contracts folder and we see only what they pick. | `drive.file` is non-sensitive, so no CASA. `drive.readonly` is **restricted** (CASA), so avoid it. | |
| SharePoint / OneDrive | Graph `Sites.Selected` (admin grants one site) or `Files.Read.All` | Publisher verification | `Sites.Selected` is the narrow option IT teams prefer. |
| Dropbox, Box | OAuth, read-only file scopes | App review by each | Good candidates for Merge File Storage if we add many. |
| DocuSign | eSignature REST API, OAuth, read envelopes and documents | DocuSign go-live review | Gives *signed* versions with signing dates, the best evidence for "captured savings" (spec §8, question 3). |

### 3.4 Public pricing and terms pages (Phase 2)

Not a customer connector. We crawl each tracked vendor's pricing page and terms of service on a schedule, store text and a hash in `pricing_snapshot`, and use the AI to summarise what changed. Feeds the Terms / pricing change lever. Respect `robots.txt` and each site's terms; fetch at low frequency (daily or weekly).

---

## 4. Shared pieces every connector needs

- **Connection manager.** One record per connection: provider, status, scopes granted, last successful sync, last error. Drives the Sources page, the "Okta stopped syncing 3 days ago" strip and the "stale" markers (spec §5.5).
- **Vendor matcher.** Maps raw names from spend lines, SSO app names and contract parties to one `vendor`. Start with a curated catalogue of the top ~500 SaaS vendors (names, aliases, domains, card descriptors), plus AI matching for the rest, with a "Needs review" queue. Every connector depends on this, so it is in the MVP.
- **Sync scheduler.** Initial backfill on connect (90 days identity, 13 months spend), then incremental: identity daily (hourly for Okta and Entra, given short retention), spend daily, email as it arrives.
- **Our own history.** Store daily per-user, per-app activity ourselves. Entra (7–30 days) and Okta (90 days) do not keep enough history for 60/90-day inactivity or year-over-year views.
- **Token security.** Refresh tokens encrypted with a KMS key, never logged, deleted on disconnect. A customer-facing "Disconnect and delete data" button per source.

---

## 5. Security and compliance

| Item | When | Why |
|---|---|---|
| Google OAuth verification + Marketplace listing | MVP | Needed for the Google Workspace connector to go beyond test users. |
| Intuit app assessment, Xero partner onboarding | MVP | Needed for production keys and app store listings. |
| Privacy policy, DPA, sub-processor list | MVP | Finance buyers' first legal ask. List Nango and our AI provider as sub-processors. |
| **SOC 2 Type I**, then Type II | Start in Phase 1, Type I by first paid customers | Mid-market CFOs and their IT teams will ask early. Use a compliance automation tool to get there in a few months. Type II needs a 3–12 month observation window, so start the clock early. |
| Microsoft publisher verification | Phase 2 | Removes the "unverified" warning on the consent screen. |
| Okta OIN review | Phase 2 | Listing in the Okta catalogue. |
| Google CASA Tier 2 (annual) | Phase 3, only if we ship Gmail search | Restricted Gmail scope. |
| Pen test | Before SOC 2 Type II | Expected by SOC 2 auditors and security questionnaires. |

Data minimisation to state in the product and the DPA: we read sign-in dates and license counts, not email or file content (except contract documents the customer gives us); we never write to connected systems; we do not train shared models on customer contracts without consent.

---

## 6. Build order

### Phase 1: MVP (about 8–10 weeks)

Goal: a new customer sees deadlines, spend and rough seat usage within 10 minutes (spec §7 "Time to first $").

| # | Work | Unlocks |
|---|---|---|
| 1 | Contract upload + AI extraction pipeline + review mode | Notice deadlines, Missed auto-renewal, Price increase over cap (with uploaded quote), KPI tile 4 coverage |
| 2 | Email forwarding address | Renewal quotes and notices arrive without the user logging in |
| 3 | Vendor matcher + catalogue | Everything below |
| 4 | QuickBooks Online + Xero (on Nango auth) + CSV upload | Duplicate tools, spend under management, apps with no contract |
| 5 | Google Workspace (Reports + Directory) | Unused seats for apps that use Google sign-in |
| 6 | Connection manager, Sources page, stale markers | Spec §5.2 and §5.5 states |

Compliance in parallel: Google verification, Intuit assessment, Xero onboarding, privacy policy and DPA, start SOC 2 readiness.

### Phase 2: broaden identity and spend (about 6–8 weeks)

1. Okta (strongest app map for mid-market)
2. Microsoft 365 / Entra ID
3. Ramp and Brex
4. Pricing and ToS page monitor
5. SOC 2 Type I report

### Phase 3: depth and accuracy

1. Vendor admin APIs, top 10–15 by customer spend: likely Salesforce, Slack, Zoom, HubSpot, Atlassian, Microsoft, Google, Adobe, Notion, DocuSign
2. DocuSign, Google Drive (`drive.file`), SharePoint (`Sites.Selected`)
3. Gmail and Outlook mailbox search, only if customers ask (Gmail needs annual CASA)
4. More accounting systems (NetSuite, Sage Intacct): evaluate Merge Accounting at this point

---

## 7. Open questions

1. Forwarding domain: what domain do we use for `contracts@…` addresses?
2. Do we run Nango cloud or self-host it? (Recommendation: cloud for the MVP, revisit at SOC 2 Type II.)
3. Microsoft tenants without Entra ID P1/P2: do we fall back to `signInActivity` only, or ask for an M365 admin usage report export?
4. Intuit read-call metering: estimate reads per customer per month to pick the Builder or Silver tier before launch.
5. Which AI provider processes contract text, and what retention terms do we agree with them? This goes in the DPA.

---

## Sources checked (2026-11-15)

- Google: [Reports API login guide](https://developers.google.com/workspace/admin/reports/v1/guides/manage-audit-login), [token guide](https://developers.google.com/workspace/admin/reports/v1/guides/manage-audit-tokens), [Reports API auth scopes](https://developers.google.com/workspace/admin/reports/auth), [data retention and lag times](https://knowledge.workspace.google.com/admin/reports/data-retention-and-lag-times), [restricted scopes list](https://support.google.com/cloud/answer/13464325)
- Microsoft: [List signIns](https://learn.microsoft.com/en-us/graph/api/signin-list), [signInActivity resource](https://learn.microsoft.com/en-us/graph/api/resources/signinactivity)
- Okta: [Monitor / System Log concepts](https://developer.okta.com/docs/concepts/monitor), [System Log API](https://developer.okta.com/docs/api/openapi/okta-management/management/tags/systemlog/other/listlogevents), [Okta Integration Network](https://developer.okta.com/okta-integration-network/)
- Xero: [API changelog](https://developer.xero.com/changelog) (granular scopes, deprecation date), [developer pricing](https://developer.xero.com/pricing)
- Intuit: [Truto summary of QuickBooks API pricing and limits](https://truto.one/blog/how-much-does-the-quickbooks-api-cost-2026-pricing-rate-limits/) (third party; verify on developer.intuit.com)
- Slack: [team.billableInfo](https://docs.slack.dev/reference/methods/team.billableInfo/), [team.accessLogs](https://docs.slack.dev/reference/methods/team.accessLogs/)
- Unified APIs: [Merge pricing](https://www.merge.dev/pricing), [Nango pricing](https://nango.dev/pricing), [Nango guide to Google security review](https://nango.dev/docs/api-integrations/google-shared/google-security-review) (third party)
