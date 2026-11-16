# Legal pages

Public pages, no login needed:

| Page | URL | Short URL |
| --- | --- | --- |
| Privacy policy | `/legal/privacy` | `/privacy` |
| Terms of service | `/legal/terms` | `/terms` |
| Data processing agreement (GDPR Art. 28) | `/legal/dpa` | `/dpa` |
| Subprocessors | `/legal/subprocessors` | `/subprocessors` |

They are linked from the landing page footer, the login and signup screen (with an "By creating an account you agree…" line),
and the Billing page.

**These are drafts.** Each page shows a "Draft for legal review" banner. Have a lawyer (ideally one who knows Bulgarian and EU
data-protection law) review them before relying on them.

## Filling in the company details

Set these in Vercel (Project → Settings → Environment Variables) and in `.env.local`, then redeploy:

| Variable | Example |
| --- | --- |
| `LEGAL_COMPANY_NAME` | `Example Ltd.` |
| `LEGAL_COMPANY_ID` | `EIK 123456789` |
| `LEGAL_ADDRESS` | `1 Example St, 1000 Sofia, Bulgaria` |
| `LEGAL_EMAIL` | `privacy@your-domain.com` |
| `APP_URL` | `https://your-domain.com` (already used by emails and OAuth) |
| `LEGAL_REVIEWED` | `true` once a lawyer has signed off, to hide the draft banner |

Everything lives in `src/lib/legal.ts`: the defaults, the "Last updated" date, and the subprocessor and integration lists.
Change the date whenever the text changes in substance, and email workspace owners 30 days before adding a subprocessor
(the DPA promises this).

## Where to paste the URLs

- **Google Cloud** OAuth consent screen: Privacy policy `https://<domain>/privacy`, Terms `https://<domain>/terms`. The privacy
  policy already includes the Google API Services User Data Policy "Limited Use" statement that Google's verification checks for.
- **Microsoft Entra** app registration → Branding & properties: Terms of service URL and Privacy statement URL.
- **Stripe** Settings → Public details / Business details: Terms of service and Privacy policy URLs.
- **Intuit** and **Xero** app settings: Privacy policy and EULA / Terms URLs.

## Things to check with the lawyer

- Retention periods (30 days after closing, 90 days in backups, 10 years for invoices).
- Liability cap (12 months of fees, EUR 100 during the trial) and the Sofia courts clause.
- Whether Vercel functions are pinned to an EU region (Vercel → Settings → Functions → Region, e.g. `fra1`); the subprocessor list says "in the EU where configured".
- Resend's sending region and Anthropic's DPA terms at the time of signing.
