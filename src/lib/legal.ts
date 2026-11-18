// Company details shown on the legal pages (/legal/*). Each one can be set by an environment variable,
// so nothing needs a code change when the company is registered or the real domain goes live.
// Until then the pages show the bracketed placeholders below. See docs/legal-pages.md.

function env(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

export const LEGAL = {
  /** Registered legal name of the company that sells Outflow, e.g. "Example Ltd." (ЕООД). */
  companyName: env("LEGAL_COMPANY_NAME", "[Company legal name]"),
  /** Bulgarian company ID (ЕИК / UIC). */
  companyId: env("LEGAL_COMPANY_ID", "[Company ID (EIK)]"),
  /** Registered address. */
  address: env("LEGAL_ADDRESS", "[Registered address], Bulgaria"),
  /** Where privacy, legal and data-protection requests go. */
  email: env("LEGAL_EMAIL", "[privacy@your-domain.com]"),
  /** The app's public address. Falls back to the current Vercel URL. */
  appUrl: (process.env.APP_URL?.trim() || "https://outflow.radivarius.com").replace(/\/$/, ""),
  /** Date shown as "Last updated". Change it whenever a page changes in substance. */
  lastUpdated: "16 November 2026",
  /** Shown as a banner on every legal page until a lawyer has reviewed them. Set LEGAL_REVIEWED=true to hide it. */
  isDraft: process.env.LEGAL_REVIEWED !== "true",
};

export const LEGAL_PAGES = [
  { href: "/legal/privacy", label: "Privacy policy" },
  { href: "/legal/terms", label: "Terms of service" },
  { href: "/legal/dpa", label: "Data processing agreement" },
  { href: "/legal/subprocessors", label: "Subprocessors" },
] as const;

export type Subprocessor = { name: string; purpose: string; data: string; location: string; safeguard: string; url: string };

/** Keep this list current: customers are told about changes to it (see the DPA). */
export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Supabase, Inc.",
    purpose: "Database, file storage for uploaded contracts, and sign-in",
    data: "All Customer Data, account details",
    location: "EU (Frankfurt, Germany, AWS eu-central-1)",
    safeguard: "Hosted in the EU; Supabase DPA with SCCs for any support access from the US",
    url: "https://supabase.com/legal/dpa",
  },
  {
    name: "Vercel Inc.",
    purpose: "Hosting and running the web application",
    data: "Customer Data in transit, request logs (IP address, browser)",
    location: "Global edge network; functions run in the EU where configured",
    safeguard: "EU-US Data Privacy Framework and SCCs (Vercel DPA)",
    url: "https://vercel.com/legal/dpa",
  },
  {
    name: "Anthropic, PBC",
    purpose: "AI reading of uploaded contracts, drafting renegotiation emails, classifying discovered tools",
    data: "Contract text and extracted terms, vendor and tool names",
    location: "United States",
    safeguard: "SCCs (Anthropic DPA). Commercial API data is not used to train models",
    url: "https://www.anthropic.com/legal/commercial-terms",
  },
  {
    name: "Resend (Plus Five Five, Inc.)",
    purpose: "Sending renewal reminders, team invites and sign-in emails",
    data: "Recipient name and email, email content",
    location: "United States (EU sending region where available)",
    safeguard: "EU-US Data Privacy Framework and SCCs (Resend DPA)",
    url: "https://resend.com/legal/dpa",
  },
  {
    name: "Stripe Payments Europe, Ltd.",
    purpose: "Subscription billing, invoices and card payments",
    data: "Billing contact, company and payment details",
    location: "Ireland, with processing in the United States",
    safeguard: "EU-US Data Privacy Framework and SCCs (Stripe DPA)",
    url: "https://stripe.com/legal/dpa",
  },
];

/** Services the Customer chooses to connect. They hold the source data; we only read from them. */
export const INTEGRATIONS: Subprocessor[] = [
  {
    name: "Google (Google Workspace)",
    purpose: "Optional: read the user directory and sign-in reports to find tools in use",
    data: "User names, emails, third-party app sign-in events",
    location: "Per the Customer's Google Workspace settings",
    safeguard: "Read-only admin scopes; Google API Services User Data Policy (Limited Use)",
    url: "https://workspace.google.com/terms/dpa_terms.html",
  },
  {
    name: "Microsoft (Entra ID / Microsoft 365)",
    purpose: "Optional: read users and sign-in logs to find tools in use",
    data: "User names, emails, app sign-in events",
    location: "Per the Customer's Microsoft tenant",
    safeguard: "Read-only Graph permissions; Microsoft Products and Services DPA",
    url: "https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA",
  },
  {
    name: "Google Drive",
    purpose: "Optional: read contract files from a folder a user picks, for bulk import",
    data: "Contract documents (PDF, Word, Google Docs) in the chosen folder",
    location: "Per the Customer's Google Workspace settings",
    safeguard: "Read-only Drive scope, used only for imports the user starts; Google API Services User Data Policy (Limited Use)",
    url: "https://workspace.google.com/terms/dpa_terms.html",
  },
  {
    name: "Microsoft (SharePoint / OneDrive)",
    purpose: "Optional: read contract files from a folder a user picks, for bulk import",
    data: "Contract documents (PDF, Word) in the chosen folder",
    location: "Per the Customer's Microsoft tenant",
    safeguard: "Read-only Graph permissions (Files.Read.All, Sites.Read.All); Microsoft Products and Services DPA",
    url: "https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA",
  },
  {
    name: "Intuit (QuickBooks Online)",
    purpose: "Optional: read bills and expenses to find software vendors",
    data: "Vendor names, amounts, dates",
    location: "United States",
    safeguard: "Read-only use; Intuit data processing terms",
    url: "https://www.intuit.com/privacy/statement/",
  },
  {
    name: "Xero Limited",
    purpose: "Optional: read invoices, bank transactions and contacts to find software vendors",
    data: "Vendor names, amounts, dates",
    location: "Per the Customer's Xero region",
    safeguard: "Read-only scopes; Xero data processing terms",
    url: "https://www.xero.com/legal/terms/data-processing/",
  },
];
