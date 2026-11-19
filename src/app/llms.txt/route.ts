import { HOME_FAQ, SITE, SOLUTIONS, absoluteUrl } from "@/lib/site";
import { PLANS } from "@/lib/billing/plans";

// llms.txt (https://llmstxt.org): a plain-text summary of Outflow for AI assistants and answer engines,
// built from the same facts as the public pages so it never drifts from them.
export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} is made by ${SITE.publisher.name} (${SITE.publisher.url}). It is a web app for ${SITE.audience}. It is sold to businesses only.`,
    "",
    "## What Outflow does",
    "",
    "- Builds a list of every SaaS tool a company pays for from accounting (QuickBooks, Xero) and sign-in data (Google Workspace, Microsoft).",
    "- Reads SaaS contracts, order forms and renewal quotes with AI (Claude by Anthropic) and extracts renewal date, notice period, auto-renewal, price-increase cap, seat-reduction rights, annual fee and seat count, each with the source quote and page number.",
    "- Emails the tool owner and admins 90, 60 and 30 days before each notice deadline, and keeps a renewal calendar that exports to Outlook, Google Calendar or Apple Calendar.",
    "- Tracks price changes across contract terms and renewal quotes, flags increases above the contract cap, and drafts a pushback email to the vendor that quotes the clause.",
    "- Compares paid seats with active users and finds overlapping tools across departments.",
    "- Asks each department owner 4 short questions per tool and recommends keep, cut seats, consolidate, renegotiate or cancel at every renewal, with an approval workflow and audit log.",
    "- Contracts can be uploaded, forwarded to a per-company email address, or bulk imported from a ZIP or folder.",
    "- Security: EU GDPR, database hosted in the EU (Frankfurt), encryption in transit and at rest, per-workspace isolation, roles, two-step sign-in, audit log.",
    "",
    "## Pricing",
    "",
    "- Free audit of the first 3 contracts and a 14-day free trial, no credit card needed.",
    ...PLANS.map(
      (p) =>
        `- ${p.name}: ${p.blurb} ${p.contracts === null ? "Unlimited contracts" : `${p.contracts} contracts`}, ${p.people === null ? "unlimited people" : `${p.people} people`}.`,
    ),
    `- Current prices: ${absoluteUrl("/pricing")}`,
    "",
    "## Pages",
    "",
    `- [Home](${absoluteUrl("/")}): what Outflow is, how it works, FAQ`,
    `- [Pricing](${absoluteUrl("/pricing")}): plans and prices`,
    ...SOLUTIONS.map((s) => `- [${s.title}](${absoluteUrl(`/solutions/${s.slug}`)}): ${s.description}`),
    "",
    "## FAQ",
    "",
    ...HOME_FAQ.flatMap((f) => [`### ${f.q}`, "", f.a, ""]),
    ...SOLUTIONS.flatMap((s) => s.faq.flatMap((f) => [`### ${f.q}`, "", f.a, ""])),
    "## Optional",
    "",
    `- [Privacy policy](${absoluteUrl("/legal/privacy")})`,
    `- [Terms of service](${absoluteUrl("/legal/terms")})`,
    `- [Data processing agreement](${absoluteUrl("/legal/dpa")})`,
    `- [Subprocessors](${absoluteUrl("/legal/subprocessors")})`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
