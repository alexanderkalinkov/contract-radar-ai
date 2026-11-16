# Enterprise basics: audit log, entities, SSO

Roles are in [roles.md](roles.md). This page covers the rest of the enterprise basics, all added by
`supabase/migrations/20261116230000_audit_entities_sso.sql` (run it once in the Supabase SQL editor).

## Audit log

Sidebar → **Audit log** (admins and approvers). Filter by contracts, approvals, people, invites or SSO, and export the last 12 months as CSV.

- **Database changes are logged by triggers**, so nothing can skip them: contracts (added, changed fields, deleted), members (joined, role changed, removed), invites (sent, accepted, cancelled), departments, tools, entities, cost centres, workspace settings, connected sources and SSO settings. Changed rows store only the fields that changed (`{"field": {"from", "to"}}`).
- **App events** go through `public.log_audit(ws, action, target_type, target_id, target_label, details)` (TS: `logAudit()` in `src/lib/server/audit.ts`): sign-ins (password, SSO or email link), opening a contract PDF, exporting the log. Renewal approvals log `renewal.recommended / revised / approved / rejected / reopened`.
- The table is append only: signed-in users get `select` (admins and approvers, through RLS) and nothing else. Rows stay as long as the workspace exists.

## Entities and cost centres

Workspace settings → **Entities and cost centres**. The workspace is the parent organisation; each brand, subsidiary or region is an entity with its own currency (and optional short code and country). Each entity has cost centres.

- On each contract page, **Booked to** picks the entity and cost centre (the linked tool follows). It only shows once the workspace has an entity.
- The settings card shows each entity's yearly contract spend in its own currencies. There's no currency conversion yet, so totals are listed per currency.
- The database checks that a cost centre belongs to the chosen entity and the same workspace.

## Single sign-on (SAML)

What works now, without any plan change:
- Admins see **Single sign-on** in Workspace settings with the Entity ID and ACS URL to give their identity provider, and request SSO for their own email domain with the IdP's metadata URL. Personal domains (gmail.com etc.) and other people's domains are refused.
- People who sign in through SSO join that workspace automatically with the role the admin picked (department owner, approver or viewer, never admin).
- **Require SSO** blocks password sign-in for that domain and signs out existing password sessions. An admin can only turn it on from a session that itself signed in with SSO, so nobody gets locked out by a provider that doesn't work.

To switch it on for real (Alex, once):
1. Supabase SAML SSO needs the **Pro plan** or above (the project is on Free today). Upgrade, then enable SAML under Authentication → Sign In / Providers → SAML 2.0.
2. Create a personal access token at supabase.com/dashboard/account/tokens and add `SUPABASE_ACCESS_TOKEN=...` to `.env.local` (never to Vercel).
3. Add `SSO_ENABLED=true` in Vercel and redeploy. This shows the "Sign in with SSO" button on the sign-in page.
4. When a customer requests SSO: check the domain is really theirs, then run `npm run sso:activate` to list requests and `npm run sso:activate -- acme.com` to activate one (`-- acme.com off` to turn it off).
