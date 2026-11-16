// Vendor matcher: maps messy names from bills, card lines and sign-in logs ("SLACK T0123 DUBLIN",
// "ZOOM.US 888-799-9666", "Amazon Web Services EMEA SARL") to one known vendor with a category and the
// department that usually owns it. Names the catalogue doesn't know go to Claude when a key is set.

/** Canonical department groups. Workspace departments are matched to these by name and synonyms. */
export const DEPT_GROUPS: Record<string, RegExp> = {
  Sales: /^(sales|revenue|business development|bd|bizdev|account management|commercial)$/i,
  Marketing: /^(marketing|growth|brand|communications|comms|demand gen(eration)?|content)$/i,
  Engineering: /^(engineering|eng|r&d|r & d|research and development|development|dev|tech|technology|software|platform|data|data & analytics)$/i,
  Product: /^(product|product management|design|product & design|ux)$/i,
  "Customer Success": /^(customer success|cs|support|customer support|customer service|customer experience|cx|service|services)$/i,
  Finance: /^(finance|accounting|fp&a|finance & accounting|controlling)$/i,
  "People & HR": /^(people|hr|people & hr|people and hr|human resources|talent|recruiting|people ops|people operations)$/i,
  Operations: /^(operations|ops|logistics|supply chain|admin|administration|facilities|bizops|business operations)$/i,
  "IT & Security": /^(it|security|it & security|it and security|infosec|information technology|it ops|internal it)$/i,
  Legal: /^(legal|compliance|legal & compliance)$/i,
};

export const DEPT_GROUP_NAMES = Object.keys(DEPT_GROUPS);

/** Which canonical group a department label (workspace department or directory field) belongs to. */
export function deptGroup(label: string): string | null {
  const l = label.trim().toLowerCase().replace(/\s+/g, " ");
  if (!l) return null;
  for (const [g, re] of Object.entries(DEPT_GROUPS)) if (g.toLowerCase() === l || re.test(l)) return g;
  return null;
}

/** Find the workspace department for a label: exact name first, then same canonical group. */
export function matchDepartment<D extends { id: string; name: string }>(label: string | null, departments: D[]): D | null {
  if (!label) return null;
  const l = label.trim().toLowerCase();
  const exact = departments.find((d) => d.name.trim().toLowerCase() === l);
  if (exact) return exact;
  const g = deptGroup(label);
  if (!g) return null;
  return departments.find((d) => deptGroup(d.name) === g) ?? null;
}

interface Vendor {
  key: string;
  name: string;
  category: string;
  /** Department group that usually owns it. "IT & Security" for company-wide tools. */
  dept: string;
  re: RegExp;
  /** Used company-wide: department suggestion falls back to IT / Operations, not the users' department. */
  companyWide?: boolean;
}

const V = (key: string, name: string, category: string, dept: string, re: RegExp, companyWide = false): Vendor => ({ key, name, category, dept, re, companyWide });

export const CATALOG: Vendor[] = [
  // Company-wide (Azure first so it does not match "Microsoft 365")
  V("azure", "Microsoft Azure", "Developer tools", "Engineering", /\bazure\b/i),
  V("m365-copilot", "Microsoft 365 Copilot", "Other", "IT & Security", /(microsoft|m365|365)\s*copilot|^copilot$/i, true),
  V("visio", "Microsoft Visio", "Design", "Engineering", /\bvisio\b/i),
  V("ms-project", "Microsoft Project", "Project management", "Operations", /microsoft project|\bproject (plan|online|professional)\b/i),
  V("dynamics", "Microsoft Dynamics 365", "CRM & sales", "Sales", /dynamics\s*365|\bdynamics\b/i),
  V("google-workspace", "Google Workspace", "Docs & knowledge", "IT & Security", /google\s*(\*\s*)?(workspace|g ?suite|apps)|gsuite/i, true),
  V("microsoft-365", "Microsoft 365", "Docs & knowledge", "IT & Security", /microsoft\s*365|office\s*365|\bo365\b|\bm365\b|msft\s*\*|microsoft\s*(online|ireland|corporation)|\bmicrosoft\b/i, true),
  V("slack", "Slack", "Chat & email", "IT & Security", /\bslack\b/i, true),
  V("zoom", "Zoom", "Video meetings", "IT & Security", /\bzoom(\.us| video| communications)?\b/i, true),
  V("notion", "Notion", "Docs & knowledge", "IT & Security", /\bnotion\b/i, true),
  V("1password", "1Password", "Security & IT", "IT & Security", /1\s*password|agilebits/i, true),
  V("lastpass", "LastPass", "Security & IT", "IT & Security", /lastpass/i, true),
  V("okta", "Okta", "Security & IT", "IT & Security", /\bokta\b/i, true),
  V("dropbox", "Dropbox", "Storage & files", "IT & Security", /dropbox(?!\s*sign)/i, true),
  V("box", "Box", "Storage & files", "IT & Security", /\bbox\.com\b|\bbox,? inc\b/i, true),
  V("docusign", "DocuSign", "E-signature", "Legal", /docu\s*sign/i),
  V("loom", "Loom", "Video meetings", "IT & Security", /\bloom\b/i, true),
  V("miro", "Miro", "Design", "Product", /\bmiro\b|realtimeboard/i),
  V("calendly", "Calendly", "Other", "Sales", /calendly/i),
  V("grammarly", "Grammarly", "Docs & knowledge", "Marketing", /grammarly/i),
  V("openai", "ChatGPT (OpenAI)", "Other", "IT & Security", /openai|chatgpt/i, true),
  V("anthropic", "Claude (Anthropic)", "Other", "IT & Security", /anthropic|claude\.ai/i, true),
  V("webex", "Webex", "Video meetings", "IT & Security", /webex/i, true),
  V("ringcentral", "RingCentral", "Chat & email", "Customer Success", /ringcentral/i),
  V("dialpad", "Dialpad", "Chat & email", "Sales", /dialpad/i),
  V("aircall", "Aircall", "Chat & email", "Customer Success", /aircall/i),
  // Sales
  V("salesforce", "Salesforce", "CRM & sales", "Sales", /salesforce|sfdc/i),
  V("hubspot", "HubSpot", "Marketing", "Marketing", /hubspot/i),
  V("pipedrive", "Pipedrive", "CRM & sales", "Sales", /pipedrive/i),
  V("gong", "Gong", "CRM & sales", "Sales", /\bgong(\.io)?\b/i),
  V("outreach", "Outreach", "CRM & sales", "Sales", /outreach\.io|\boutreach\b/i),
  V("salesloft", "Salesloft", "CRM & sales", "Sales", /salesloft/i),
  V("apollo", "Apollo.io", "CRM & sales", "Sales", /apollo\.io|apollo io/i),
  V("zoominfo", "ZoomInfo", "CRM & sales", "Sales", /zoominfo/i),
  V("linkedin", "LinkedIn (Sales Navigator, Recruiter, Ads)", "CRM & sales", "Sales", /linkedin|lnkd/i),
  V("pandadoc", "PandaDoc", "E-signature", "Sales", /pandadoc/i),
  // Marketing
  V("mailchimp", "Mailchimp", "Marketing", "Marketing", /mailchimp|intuit mailchimp/i),
  V("semrush", "Semrush", "Marketing", "Marketing", /semrush/i),
  V("ahrefs", "Ahrefs", "Marketing", "Marketing", /ahrefs/i),
  V("hootsuite", "Hootsuite", "Marketing", "Marketing", /hootsuite/i),
  V("buffer", "Buffer", "Marketing", "Marketing", /\bbuffer\b/i),
  V("canva", "Canva", "Design", "Marketing", /\bcanva\b/i),
  V("webflow", "Webflow", "Marketing", "Marketing", /webflow/i),
  V("wpengine", "WP Engine", "Marketing", "Marketing", /wp\s*engine/i),
  V("typeform", "Typeform", "Marketing", "Marketing", /typeform/i),
  V("surveymonkey", "SurveyMonkey", "Marketing", "Marketing", /surveymonkey|momentive/i),
  V("marketo", "Marketo", "Marketing", "Marketing", /marketo/i),
  V("klaviyo", "Klaviyo", "Marketing", "Marketing", /klaviyo/i),
  V("braze", "Braze", "Marketing", "Marketing", /\bbraze\b/i),
  // Product & design
  V("figma", "Figma", "Design", "Product", /figma/i),
  V("adobe", "Adobe Creative Cloud", "Design", "Marketing", /adobe(?!\s*sign)/i),
  V("lucid", "Lucid", "Design", "Product", /lucid(chart|\s*software)?/i),
  V("productboard", "Productboard", "Project management", "Product", /productboard/i),
  V("amplitude", "Amplitude", "Analytics & BI", "Product", /amplitude/i),
  V("mixpanel", "Mixpanel", "Analytics & BI", "Product", /mixpanel/i),
  // Project management
  V("asana", "Asana", "Project management", "Operations", /\basana\b/i),
  V("monday", "monday.com", "Project management", "Operations", /monday\.com|monday com/i),
  V("clickup", "ClickUp", "Project management", "Operations", /clickup/i),
  V("smartsheet", "Smartsheet", "Project management", "Operations", /smartsheet/i),
  V("airtable", "Airtable", "Project management", "Operations", /airtable/i),
  V("atlassian", "Atlassian (Jira, Confluence)", "Project management", "Engineering", /atlassian|\bjira\b|confluence|trello|bitbucket/i),
  V("linear", "Linear", "Project management", "Engineering", /linear\.app|\blinear\b/i),
  // Engineering
  V("github", "GitHub", "Developer tools", "Engineering", /github/i),
  V("gitlab", "GitLab", "Developer tools", "Engineering", /gitlab/i),
  V("aws", "Amazon Web Services", "Developer tools", "Engineering", /amazon web services|\baws\b/i),
  V("gcp", "Google Cloud", "Developer tools", "Engineering", /google\s*(\*\s*)?cloud|\bgcp\b/i),
  V("datadog", "Datadog", "Developer tools", "Engineering", /datadog/i),
  V("sentry", "Sentry", "Developer tools", "Engineering", /sentry/i),
  V("newrelic", "New Relic", "Developer tools", "Engineering", /new\s*relic/i),
  V("pagerduty", "PagerDuty", "Developer tools", "Engineering", /pagerduty/i),
  V("vercel", "Vercel", "Developer tools", "Engineering", /vercel/i),
  V("heroku", "Heroku", "Developer tools", "Engineering", /heroku/i),
  V("digitalocean", "DigitalOcean", "Developer tools", "Engineering", /digital\s*ocean/i),
  V("cloudflare", "Cloudflare", "Developer tools", "Engineering", /cloudflare/i),
  V("postman", "Postman", "Developer tools", "Engineering", /postman/i),
  V("jetbrains", "JetBrains", "Developer tools", "Engineering", /jetbrains/i),
  V("cursor", "Cursor", "Developer tools", "Engineering", /cursor|anysphere/i),
  V("supabase", "Supabase", "Developer tools", "Engineering", /supabase/i),
  V("twilio", "Twilio", "Developer tools", "Engineering", /twilio|sendgrid/i),
  V("snowflake", "Snowflake", "Analytics & BI", "Engineering", /snowflake/i),
  V("segment", "Segment", "Analytics & BI", "Engineering", /segment\.(com|io)/i),
  // Data & BI
  V("tableau", "Tableau", "Analytics & BI", "Finance", /tableau/i),
  V("looker", "Looker", "Analytics & BI", "Engineering", /looker/i),
  V("powerbi", "Power BI", "Analytics & BI", "Finance", /power\s*bi/i),
  // Customer support
  V("zendesk", "Zendesk", "Customer support", "Customer Success", /zendesk/i),
  V("intercom", "Intercom", "Customer support", "Customer Success", /intercom/i),
  V("freshdesk", "Freshdesk", "Customer support", "Customer Success", /freshdesk|freshworks/i),
  V("front", "Front", "Customer support", "Customer Success", /frontapp|front\.com/i),
  V("helpscout", "Help Scout", "Customer support", "Customer Success", /help\s*scout/i),
  V("gorgias", "Gorgias", "Customer support", "Customer Success", /gorgias/i),
  V("gainsight", "Gainsight", "Customer support", "Customer Success", /gainsight/i),
  // Finance
  V("quickbooks", "QuickBooks", "Finance & accounting", "Finance", /quickbooks|intuit(?!\s*mailchimp)/i),
  V("xero", "Xero", "Finance & accounting", "Finance", /\bxero\b/i),
  V("netsuite", "NetSuite", "Finance & accounting", "Finance", /netsuite/i),
  V("bill", "BILL", "Finance & accounting", "Finance", /bill\.com|\bbill (operations|holdings)\b/i),
  V("expensify", "Expensify", "Finance & accounting", "Finance", /expensify/i),
  V("avalara", "Avalara", "Finance & accounting", "Finance", /avalara/i),
  V("carta", "Carta", "Finance & accounting", "Finance", /\bcarta\b/i),
  V("brex", "Brex", "Finance & accounting", "Finance", /\bbrex\b/i),
  // HR
  V("gusto", "Gusto", "HR & people", "People & HR", /gusto/i),
  V("rippling", "Rippling", "HR & people", "People & HR", /rippling/i),
  V("deel", "Deel", "HR & people", "People & HR", /\bdeel\b/i),
  V("bamboohr", "BambooHR", "HR & people", "People & HR", /bamboo\s*hr/i),
  V("lattice", "Lattice", "HR & people", "People & HR", /lattice/i),
  V("greenhouse", "Greenhouse", "HR & people", "People & HR", /greenhouse/i),
  V("lever", "Lever", "HR & people", "People & HR", /lever\.co|\blever\b/i),
  V("workday", "Workday", "HR & people", "People & HR", /workday/i),
  V("cultureamp", "Culture Amp", "HR & people", "People & HR", /culture\s*amp/i),
  V("hibob", "HiBob", "HR & people", "People & HR", /hibob|\bbob\b hr/i),
  V("personio", "Personio", "HR & people", "People & HR", /personio/i),
  // Security
  V("jamf", "Jamf", "Security & IT", "IT & Security", /\bjamf\b/i),
  V("kandji", "Kandji", "Security & IT", "IT & Security", /kandji/i),
  V("crowdstrike", "CrowdStrike", "Security & IT", "IT & Security", /crowdstrike/i),
  V("vanta", "Vanta", "Security & IT", "IT & Security", /\bvanta\b/i),
  V("drata", "Drata", "Security & IT", "IT & Security", /\bdrata\b/i),
  // E-signature
  V("dropbox-sign", "Dropbox Sign", "E-signature", "Legal", /dropbox\s*sign|hellosign/i),
  V("adobe-sign", "Adobe Acrobat Sign", "E-signature", "Legal", /adobe\s*sign/i),
];

/** Identity-log app names that are part of the platform itself, not a separate tool you pay for. */
const PLATFORM_APPS =
  /^(google (chrome|drive|docs|sheets|calendar|meet|chat|photos|play|cloud sdk|apps script|ios|android|account|workspace|admin)|android|ios account manager|macos|apple|chrome|gmail|microsoft (office|teams|outlook|edge|authentication broker|azure (cli|powershell|portal)|graph|account|intune|365 security|exchange|sharepoint|onedrive|bing|word|excel|powerpoint|onenote|planner|to.?do|stream|forms|whiteboard|edge|office 365 portal|app access panel|my (apps|profile|signins))|office ?365( .*)?|outlook( mobile)?|windows( sign in| login)?|azure portal|my apps|my profile|my signins|teams|onedrive|sharepoint( online)?|exchange online|office|bing)$/i;

export const isPlatformApp = (name: string) => PLATFORM_APPS.test(name.trim());

/** Noise to strip before comparing vendor names. */
export function normalizeVendor(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/\*|#/g, " ")
    .replace(/\b(inc|llc|ltd|limited|gmbh|bv|b\.v|sarl|sa|ag|plc|corp|corporation|co|company|emea|europe|uk|us|usa|ireland|holdings?|technologies|technology|software|labs?|hq)\b\.?/g, " ")
    .replace(/\b[a-z]*\d[a-z\d-]*\b/g, " ") // reference numbers like T0123, 888-799-9666
    .replace(/[^a-z.& ]/g, " ")
    .replace(/\.(com|io|ai|co|app|us|net|org)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Match {
  key: string;
  name: string;
  category: string;
  dept: string | null;
  companyWide: boolean;
  known: boolean;
}

/** Match a raw name to the catalogue, or fall back to a normalised key so the same unknown vendor still groups. */
export function matchVendor(raw: string): Match {
  const v = CATALOG.find((c) => c.re.test(raw));
  if (v) return { key: v.key, name: v.name, category: v.category, dept: v.dept, companyWide: Boolean(v.companyWide), known: true };
  const norm = normalizeVendor(raw) || raw.trim().toLowerCase();
  const key = norm.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "unknown";
  const name = raw.trim().replace(/\s{2,}/g, " ").slice(0, 120);
  return { key, name, category: "Other", dept: null, companyWide: false, known: false };
}

export const isCompanyWide = (key: string) => Boolean(CATALOG.find((c) => c.key === key)?.companyWide);

/** Words in an expense account or line description that mean "this is software". */
export const SOFTWARE_HINT = /software|subscri|saas|licen[cs]e|cloud|hosting|\bapps?\b|platform|dues ?& ?subscriptions|computer|it services|online services|web services|\bseats?\b/i;

/** Spend that is clearly not software, so it never reaches the review list even when it recurs monthly. */
export const NON_SOFTWARE_HINT =
  /\b(rent|lease|landlord|utilit|electric|energy|water|gas bill|cleaning|janitor|insurance|payroll|salar|wages|tax|vat|hmrc|irs|travel|hotel|airline|airfare|uber|lyft|taxi|fuel|petrol|meals?|food|catering|restaurant|coffee|bank|interest|loan|mortgage|courier|postage|shipping|freight|fedex|ups|dhl|office supplies|stationery|furniture|legal fees|accountancy|audit fees|recruit(ment)? fees|contractor|consult|marketing agency|advertis)/i;
