# SEO and AI search (GEO)

How the public site is set up to be found by Google and Bing, and quoted by ChatGPT, Perplexity, Google AI Overviews and Claude.

## What is where

| Piece | File | Address |
|---|---|---|
| Facts, FAQ and use-case copy (single source) | `src/lib/site.ts` | |
| Page metadata helper (title, canonical, Open Graph, X card) | `src/lib/page-meta.ts` | |
| Structured data (schema.org JSON-LD) | `src/lib/structured-data.ts`, `src/components/seo/JsonLd.tsx` | |
| robots.txt (AI crawlers allowed, private areas blocked) | `src/app/robots.ts` | `/robots.txt` |
| Sitemap | `src/app/sitemap.ts` (pages from `PUBLIC_PAGES`) | `/sitemap.xml` |
| llms.txt for AI assistants | `src/app/llms.txt/route.ts` | `/llms.txt` |
| Share image (1200x630) | `src/app/opengraph-image.png` | `/opengraph-image.png` |
| Web app manifest | `src/app/manifest.ts` | `/manifest.webmanifest` |
| Pricing (live Stripe prices, cached 1 hour) | `src/app/pricing/page.tsx` | `/pricing` |
| Use-case pages | `src/app/solutions/` | `/solutions`, `/solutions/<slug>` |

Public pages: `/` (signed-out home, canonical for `/home`), `/pricing`, `/solutions`, `/solutions/*`, `/legal/*`.
Everything signed-in (`(app)`, `/admin`, `/welcome`, `/setup`) has `noindex`; `/login` is `noindex, follow`.

Metadata is always in the first `<head>` (`htmlLimitedBots: /.*/` in `next.config.ts`), because most AI crawlers and link previewers don't run JavaScript.

## Rules for new content

- Every claim must be true of the product today. When a feature goes live (for example SAML SSO, which waits on Supabase Pro), add it to `site.ts`, `structured-data.ts` and `llms.txt`.
- New public page: use `pageMeta()`, add JSON-LD, add it to `PUBLIC_PAGES` in `site.ts` (sitemap + llms.txt follow), and add its path to `PUBLIC_PATHS` and `MFA_FREE_PATHS` in `src/lib/supabase/middleware.ts`.
- New use case: add an entry to `SOLUTIONS` in `site.ts`. The page, sitemap, footer links, home grid and llms.txt pick it up.
- Write answers as plain, self-contained sentences that name Outflow. AI assistants quote these word for word.
- Industry figures need a named source (see `STATS` on the home page) and a yearly re-check.

## One-time steps (Alex)

1. **Google Search Console**: add a *Domain* property `outflow.radivarius.com` (or the whole `radivarius.com`), copy the `google-site-verification=...` TXT record into GoDaddy DNS on the host `outflow` (or `@` for the whole domain), verify, then submit `https://outflow.radivarius.com/sitemap.xml` under Sitemaps.
2. **Bing Webmaster Tools**: sign in, choose *Import from Google Search Console* (fastest), or add the site and verify with the CNAME/TXT it gives. Submit the same sitemap. Bing feeds ChatGPT search and Copilot.
3. Optional, instead of DNS: set `GOOGLE_SITE_VERIFICATION` and/or `BING_SITE_VERIFICATION` in Vercel to the code from the HTML-tag method and redeploy.
4. Check the share card with LinkedIn Post Inspector (https://www.linkedin.com/post-inspector/) and the structured data with Google's Rich Results Test (https://search.google.com/test/rich-results).
5. Off-site (biggest lever for AI answers): list Outflow on G2, Capterra and Product Hunt, add it to the Radivarius site with a link, and post the use-case pages on LinkedIn. AI assistants mostly cite pages that other sites link to.
