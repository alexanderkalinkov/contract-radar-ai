// Public, crawlable facts about Outflow: one source for page metadata, structured data (JSON-LD),
// sitemap.xml and llms.txt, so search engines and AI assistants all read the same description.
// Keep every claim here true to what the product does today. See docs/seo.md.

export const SITE = {
  name: "Outflow",
  /** The public address. APP_URL in Vercel overrides it. */
  url: (process.env.APP_URL?.trim() || "https://outflow.radivarius.com").replace(/\/$/, ""),
  tagline: "SaaS contract, renewal and price-hike tracking for finance teams",
  description:
    "Outflow is a SaaS spend management tool for finance teams. It finds every software tool a company pays for, reads the contracts with AI, warns before auto-renewal notice deadlines and price hikes, and recommends whether to keep, cut seats, consolidate or renegotiate each tool.",
  shortDescription:
    "Find every SaaS tool you pay for, catch auto-renewals and price hikes before the notice deadline, and know what to keep, cut or renegotiate.",
  audience: "CFOs, COOs, finance and procurement teams at companies with 50 to 1,000 employees",
  publisher: {
    name: "Radivarius",
    url: "https://radivarius.com",
  },
  keywords: [
    "SaaS spend management",
    "SaaS renewal tracking",
    "SaaS contract management",
    "auto-renewal alerts",
    "SaaS price increase",
    "unused SaaS licenses",
    "software license optimization",
    "renewal calendar",
    "vendor negotiation",
    "contract notice period",
  ],
} as const;

export const absoluteUrl = (path = "/") => `${SITE.url}${path === "/" ? "" : path}` || SITE.url;

export type Faq = { q: string; a: string };

/** Shown on the home page and published as FAQPage structured data. Plain sentences: AI answers quote these. */
export const HOME_FAQ: Faq[] = [
  {
    q: "What is Outflow?",
    a: "Outflow is a SaaS spend and contract management tool for finance teams. It builds a list of every software tool your company pays for, reads each contract with AI to pull out the renewal date, notice period, auto-renewal terms and price-increase cap, and alerts the owner before the notice deadline passes. Each renewal gets a recommendation: keep, cut seats, consolidate or renegotiate.",
  },
  {
    q: "Who is Outflow for?",
    a: "Outflow is built for CFOs, COOs, finance and procurement teams at companies with roughly 50 to 1,000 employees, where software is bought by many teams and nobody has the full picture of renewals and notice deadlines.",
  },
  {
    q: "How does Outflow find the SaaS tools we pay for?",
    a: "Outflow connects to your accounting system (QuickBooks or Xero) to find software vendors in your spend, and to Google Workspace or Microsoft sign-in data to see which tools people actually use. You can also upload contracts, forward them to your company's Outflow email address, or bulk import a ZIP or folder of contracts.",
  },
  {
    q: "How does Outflow catch auto-renewals before they lock in?",
    a: "Outflow's AI reads the notice period and renewal date from each contract and works out the last day you can cancel or renegotiate. The tool owner and admins get email reminders 90, 60 and 30 days before that deadline, and every renewal appears on a shared renewal calendar you can add to Outlook or Google Calendar.",
  },
  {
    q: "Can Outflow help push back on a SaaS price increase?",
    a: "Yes. Outflow tracks the price of each tool across contracts and renewal quotes, flags increases, and shows them next to any price-increase cap in your contract. With one click, AI drafts a pushback email to the vendor that quotes the exact clause and page number.",
  },
  {
    q: "How accurate is the AI contract extraction?",
    a: "Every extracted term comes with the exact passage and page number from the source document, so anyone can check it in seconds. Your team can confirm or correct each term, and nothing is treated as final until it is verified.",
  },
  {
    q: "How is Outflow different from a spreadsheet of renewals?",
    a: "A spreadsheet only knows what someone typed in. Outflow builds the tool list from your books and sign-in data, reads the notice terms from the contracts themselves, sends reminders automatically, tracks price changes between terms, and asks each department owner to confirm how much the tool matters before every renewal.",
  },
  {
    q: "Is our contract data secure?",
    a: "Outflow is built for business use under the EU GDPR. Data is encrypted in transit and at rest, each company's workspace is isolated, and access is controlled by roles. The database is hosted in the EU (Frankfurt). Two-step sign-in with an authenticator app and an audit log of every change are built in. The list of subprocessors is public.",
  },
  {
    q: "How much does Outflow cost?",
    a: "Outflow starts with a free audit of your first 3 contracts and a 14-day free trial, no credit card needed. Paid plans (Starter, Growth and Business) are priced by the number of contracts and people, with a discount for yearly billing. Current prices are on the pricing page.",
  },
  {
    q: "How long does setup take?",
    a: "About 10 minutes for the first admin to create the workspace and connect accounting and sign-in data. Department owners then confirm their tools and answer 4 short questions per tool, which takes a few minutes each.",
  },
];

export type Solution = {
  slug: string;
  /** Short name for menus and the footer. */
  nav: string;
  /** Page <title>, written the way people search. */
  title: string;
  description: string;
  h1: string;
  intro: string;
  problem: { title: string; body: string };
  steps: { title: string; body: string }[];
  outcomes: string[];
  faq: Faq[];
};

export const SOLUTIONS: Solution[] = [
  {
    slug: "saas-renewal-tracking",
    nav: "SaaS renewal tracking",
    title: "SaaS renewal tracking and auto-renewal alerts",
    description:
      "Track every SaaS renewal and notice deadline in one calendar. Outflow reads notice periods from your contracts and emails the owner 90, 60 and 30 days before an auto-renewal locks in.",
    h1: "Never miss a SaaS notice deadline again",
    intro:
      "Most SaaS contracts renew automatically unless you give notice 30 to 90 days before the end of the term. Outflow reads that notice period from each contract, works out the real deadline, and makes sure the right person hears about it in time.",
    problem: {
      title: "Why auto-renewals slip through",
      body: "Software is bought by many teams, contracts live in inboxes and shared drives, and the notice period is buried in the terms. By the time the invoice arrives, the window to cancel or renegotiate has closed, and the company is locked in for another year at whatever price the vendor set.",
    },
    steps: [
      { title: "Collect the contracts", body: "Upload contracts, forward them to your company's Outflow email address, or bulk import a ZIP or folder. Outflow removes duplicates for you." },
      { title: "AI reads the terms", body: "Outflow extracts the renewal date, notice period, auto-renewal clause and price-increase cap, with the exact quote and page number for each." },
      { title: "Reminders go to the owner", body: "The department owner and admins get email reminders 90, 60 and 30 days before the notice deadline, with the facts they need to decide." },
      { title: "Decide and record it", body: "The owner recommends keep, cut seats, consolidate, renegotiate or cancel, and an approver signs off. Every decision is logged." },
    ],
    outcomes: [
      "One renewal calendar for the whole company, exportable to Outlook or Google Calendar",
      "Notice deadlines calculated from the contract, not guessed from the invoice date",
      "A named owner and a recommendation for every renewal",
      "An approval trail finance can show the auditors",
    ],
    faq: [
      { q: "What is a SaaS notice period?", a: "The notice period is how long before the end of a contract term you must tell the vendor you want to cancel or change the contract. If you miss it, most SaaS contracts renew automatically for another term, often at a higher price." },
      { q: "How far ahead does Outflow send renewal reminders?", a: "Outflow emails the tool owner and workspace admins 90, 60 and 30 days before the notice deadline, which is earlier than the renewal date itself." },
      { q: "Can I see all renewals in my own calendar?", a: "Yes. The renewal calendar shows every deadline by month, and you can download it as a calendar file for Outlook, Google Calendar or Apple Calendar." },
    ],
  },
  {
    slug: "saas-price-increase",
    nav: "SaaS price increases",
    title: "Track and push back on SaaS price increases",
    description:
      "Catch SaaS price hikes before you sign the renewal. Outflow compares each quote with your contract's price-increase cap and drafts a pushback email that quotes the clause.",
    h1: "Catch SaaS price hikes before you sign",
    intro:
      "SaaS vendors raise prices at renewal, often by more than the contract allows. Outflow tracks the price of every tool across terms and quotes, and puts each increase next to the clause that limits it.",
    problem: {
      title: "Why price hikes go unchallenged",
      body: "Renewal quotes arrive close to the deadline, the previous contract is hard to find, and few people know there is an uplift cap at all. Without the old price and the clause side by side, the increase gets approved by default.",
    },
    steps: [
      { title: "Price history per vendor", body: "Outflow matches each new contract or quote to the vendor's earlier terms, so you see the old price, the new price and the change in percent." },
      { title: "Check the cap", body: "AI reads price-escalator and uplift-cap clauses, so an increase above the cap is flagged as one the vendor may not be allowed to make." },
      { title: "Draft the pushback", body: "One click drafts an email to the vendor that cites the exact clause and page number. Edit it and send it from your own mailbox." },
      { title: "Hikes in every reminder", body: "Renewal reminder emails include the proposed increase, so the owner sees it while there is still time to negotiate." },
    ],
    outcomes: [
      "A price-hikes view across all vendors, largest increases first",
      "Increases above the contract cap flagged automatically",
      "Vendor emails drafted by AI with the clause quoted",
      "Price history kept as contracts renew",
    ],
    faq: [
      { q: "What is a SaaS uplift cap?", a: "An uplift cap, or price-increase cap, is a clause that limits how much a vendor can raise the price at renewal, for example no more than 5% per year. Many companies have one in their contract and never enforce it." },
      { q: "How much are SaaS prices rising?", a: "Independent research from Vertice's SaaS Inflation Index put SaaS price inflation at 12.7% year over year in August 2026, after a peak of 16.4% in June 2026, far above general inflation." },
      { q: "Does Outflow send emails to vendors for me?", a: "No. Outflow drafts the email with the right clause quoted, and you review it and send it yourself, so you keep control of the vendor relationship." },
    ],
  },
  {
    slug: "unused-saas-licenses",
    nav: "Unused SaaS licenses",
    title: "Find and cut unused SaaS licenses",
    description:
      "See how many SaaS seats you pay for and how many people actually use them. Outflow uses Google Workspace and Microsoft sign-in data to find unused licenses before the renewal.",
    h1: "Renew for the team you have, not the team you had",
    intro:
      "Around a third of SaaS licenses go unused at the average company. Outflow compares the seats in each contract with real sign-in activity, so you can cut them at the renewal instead of paying for another year.",
    problem: {
      title: "Why seats pile up",
      body: "Seats get added for projects, new hires and trials, and rarely get removed. The renewal quote simply repeats last year's number, and nobody checks how many people logged in over the last 90 days.",
    },
    steps: [
      { title: "Connect sign-in data", body: "Connect Google Workspace or Microsoft so Outflow can see which tools people sign in to, without reading anyone's email or files." },
      { title: "Compare seats with usage", body: "For each tool, Outflow shows seats paid against active users, and flags tools with high cost, low criticality and few logins." },
      { title: "Find overlaps", body: "Spot teams paying for different tools that do the same job, such as three project management apps, and see which one people use most." },
      { title: "Cut at renewal", body: "The seat reduction goes into the renewal recommendation, and the notice reminder makes sure it happens before the deadline." },
    ],
    outcomes: [
      "Seats paid against active users for each tool",
      "Overlapping tools across departments, with the most-used one named",
      "Low-value tools surfaced for a keep or cut decision",
      "Savings estimated before the renewal, not after",
    ],
    faq: [
      { q: "How many SaaS licenses go unused?", a: "Zylo's 2026 SaaS Management Index found that 36% of SaaS licenses go unused on average." },
      { q: "Does Outflow read our employees' email?", a: "No. Outflow uses sign-in and license data from Google Workspace or Microsoft to see which tools are used. It does not read mailboxes or files." },
      { q: "Can we reduce seats in the middle of a contract?", a: "Usually not, which is why timing matters. Outflow reads whether your contract allows seat reductions and reminds you before the notice deadline, when you can still change the number." },
    ],
  },
  {
    slug: "ai-contract-extraction",
    nav: "AI contract extraction",
    title: "AI SaaS contract extraction with source quotes",
    description:
      "Upload SaaS contracts and get the renewal date, notice period, auto-renewal terms, price cap and seat count extracted by AI, each with the source quote and page number.",
    h1: "Contract terms you can check in seconds",
    intro:
      "Outflow uses Claude, an AI model by Anthropic, to read SaaS contracts, order forms and renewal quotes. Every term it extracts links to the exact passage and page it came from.",
    problem: {
      title: "Why contract terms stay buried",
      body: "Order forms, master agreements and renewal quotes are long, inconsistent and spread across inboxes and drives. Reading each one for the notice period, auto-renewal clause and price cap takes hours, so it rarely happens before the deadline.",
    },
    steps: [
      { title: "Bring in the documents", body: "Upload PDFs or Word files, forward contracts to your workspace's email address, or bulk import a ZIP or folder from a shared drive." },
      { title: "AI extracts the terms", body: "Notice period, renewal date, auto-renewal, uplift cap, seat-reduction rights, annual fee and seat count are pulled out in seconds." },
      { title: "Check the source", body: "Each term shows the quoted passage and page number, so a reviewer can confirm or correct it with the document open." },
      { title: "Put it to work", body: "Confirmed terms feed the renewal calendar, reminders, price-hike tracking and the savings recommendations." },
    ],
    outcomes: [
      "Key commercial terms extracted from every contract",
      "Quotes and page numbers for each term",
      "Confirm or correct workflow for reviewers",
      "Duplicates removed on bulk import",
    ],
    faq: [
      { q: "Which documents can Outflow read?", a: "PDF and Word contracts, order forms, master subscription agreements and renewal quotes. You can upload them one at a time, forward them by email, or bulk import a ZIP or folder." },
      { q: "Which AI model does Outflow use?", a: "Outflow uses Claude by Anthropic to read contracts. Anthropic processes the documents as a subprocessor and does not train its models on them." },
      { q: "What terms does Outflow extract?", a: "Renewal date, notice period, auto-renewal, price-increase or uplift cap, seat-reduction rights, annual fee and number of seats, plus whether the document is a contract or a renewal quote." },
    ],
  },
];

export const PUBLIC_PAGES = [
  { path: "/", priority: 1, changeFrequency: "weekly" as const },
  { path: "/pricing", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/solutions", priority: 0.8, changeFrequency: "monthly" as const },
  ...SOLUTIONS.map((s) => ({ path: `/solutions/${s.slug}`, priority: 0.8, changeFrequency: "monthly" as const })),
  { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/legal/dpa", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/legal/subprocessors", priority: 0.3, changeFrequency: "yearly" as const },
];
