# Security

How Contract Radar protects customer data, and what to check when adding features. Last full audit: 2026-11-18.

## Passwords and sign-in
- Passwords are stored only by Supabase Auth, as bcrypt hashes in `auth.users`. The app never stores, logs or emails a password.
- Every place a password is set (sign-up, reset, change, first password after an invite) runs `passwordProblem()` in
  `src/lib/server/password.ts`: 8 to 72 characters, not built from the email, not a common password, and not in a known
  data breach (Have I Been Pwned range API: only 5 characters of the SHA-1 hash leave the server; fails open).
  This follows NIST SP 800-63B (no forced symbols or rotation).
- Changing or resetting a password signs out every other device.
- Rate limits (`src/lib/server/rate-limit.ts`, table `public.rate_limits`): sign-in 10 per email and 50 per IP per 15 min,
  sign-up 10 per IP per hour, reset email 5 per address per hour, password change 5 per 15 min, SSO start 30 per IP per 15 min.
- Redirects after sign-in go through `safeNextPath()` (`src/lib/safe-redirect.ts`), which blocks `//evil.com`, `/\evil.com`
  and encoded variants. Use it for any new `next=` / `return=` parameter.
- Links in auth emails use `APP_URL`, never the request's Host header.

### Supabase dashboard settings (Authentication)
- Email confirmations: on (required: invites match by email).
- Minimum password length: 8 or more.
- Leaked password protection: switch on when the project is on Pro (the app check above covers the Free plan).
- Add `https://contract-radar-ai.vercel.app/**` (and later the real domain) to Redirect URLs, and nothing else.

## Database
- Row-level security is on for every table; access goes through `is_workspace_member`, `is_workspace_owner`, `can_write`,
  `can_approve_renewals` (SECURITY DEFINER with `search_path = ''`).
- Supabase grants `anon`/`authenticated` full table privileges by default. Since migration
  `20261118090000_security_hardening.sql`: `anon` has no table access, nobody has TRUNCATE/TRIGGER/REFERENCES, and the
  tables users edit have column-level UPDATE grants:
  - `workspaces`: name, show_sample_data, company_size, onboarded_at, renewal_alerts
  - `workspace_members`: role, department_id, job_title
  - `workspace_sso`: metadata_url, enforce, default_role (status, provider and domain are set only by platform support)
  **When you add a column users must edit, grant UPDATE on it** or the save fails with "permission denied".
- The service-role key is used only in server code (`src/lib/server/admin.ts`, `import "server-only"`), for webhooks,
  cron, imports and the /admin console. Never import it into a client component.

## Uploads
- Contract files live in the private `contracts` bucket under `<workspace_id>/<uuid>.<pdf|docx>`, so a file name can't
  choose its path. Bucket limits: 20 MB, PDF and .docx only. Storage RLS checks workspace membership.
- The server checks the real file type (`%PDF-` / ZIP header), size, and for .docx a zip-bomb guard (`zipLooksSafe`:
  100 MB unpacked, 2,000 entries, no extreme compression ratios) before reading it.
- ZIP bulk imports are unpacked in the browser; the server only accepts file names and sizes and assigns ids.
- Uploaded contracts are untrusted: the extraction and email prompts tell Claude never to follow instructions inside a
  document, results are schema-checked, and Word text is capped at 400k characters.

## Webhooks and jobs
- Stripe: signature checked with `STRIPE_WEBHOOK_SECRET`. Resend inbound: Svix signature + 5-minute timestamp window.
- Cron and the import worker require `Authorization: Bearer <secret>`, compared in constant time.
- OAuth tokens for connectors are AES-256-GCM encrypted with `CONNECTOR_ENCRYPTION_KEY` before they reach the database.

## Browser protections
- Security headers in `next.config.ts`: CSP (scripts only from this site; frames, plugins and framing by other sites
  blocked), HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy. If you add a script, font or API
  that the browser loads from another site, add its origin to the CSP there.
- CSRF: session cookies are SameSite=Lax, server actions check Origin, and `src/middleware.ts` rejects any cross-site
  POST/PATCH/DELETE (webhooks excepted).
- React escapes everything it renders; email templates escape with `esc()`/`attr()`. Don't use `dangerouslySetInnerHTML`.

## Dependencies
- `npm audit --omit=dev` should report 0. `package.json` overrides Next's bundled PostCSS to a patched version.
