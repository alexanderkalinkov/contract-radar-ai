# Rebrand: Contract Radar → Outflow

The app is now **Outflow** (tagline "Contract Radar"), a Radivarius product at https://outflow.radivarius.com.

## What changed in the code

- Every name a user sees says Outflow: app chrome, landing page, sign-in, legal pages, emails, error pages, calendar feed, Stripe names.
- New radar logo in `Logo` (`src/components/icons.tsx`), with `tone="dark"` (navy backgrounds, default) and `tone="light"`.
- The brand name is set in Sora SemiBold (`font-brand`), the same face as the logo files.
- Favicon (`src/app/favicon.ico`, `src/app/icon.svg`), iPhone home-screen icon (`src/app/apple-icon.png`) and email logo (`public/email/logo.png`).
- Supabase auth email templates regenerated (`supabase/templates`).
- Logo files for slides, sites and docs: `docs/brand/`. The full family (Radivarius, Cloud Purge, PNGs, sizes) is in the project's brand folder.

Left on purpose: internal ids that would break things if renamed (`contract-radar` Stripe metadata, the old Vercel host redirect, the help video file name, the repo and package name).

## Steps outside the code

1. **Vercel → Environment variables:** change the name part of `EMAIL_FROM` to `Outflow <alerts@outflow.radivarius.com>` and redeploy.
2. **Supabase → Authentication → Emails → SMTP settings:** set the sender name to `Outflow`.
3. **Supabase → Authentication → Emails → Templates:** paste the 6 regenerated templates and new subjects from `supabase/templates/README.md`.
4. **Stripe:** run `npm run stripe:setup -- https://outflow.radivarius.com` once. It renames the existing products to "Outflow <plan>" (for example "Outflow Growth") without touching subscriptions. Also set the public business name under Stripe → Settings → Public details.
5. **Onboarding video:** the narration still says "Contract Radar". Re-record when convenient.
