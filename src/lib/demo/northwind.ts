// The demo workspace for sales calls: a realistic, fictional mid-size company with contracts, departments,
// department owners, survey answers, discovered tools and renewals spread over the next few months.
// Every date is relative to the day the workspace is created or reset, so the demo never looks stale.
// Pure data: src/lib/server/demo.ts writes it to the database.
import { matchVendor } from "@/lib/discovery/catalog";
import { SAMPLE_ACCOUNT, SAMPLE_SIGNALS } from "@/lib/discovery/sample";
import type { ProviderId } from "@/lib/discovery/types";
import { addDays } from "@/lib/engine";
import type { Extraction } from "@/lib/extraction";
import { extractionColumns } from "@/lib/saved";

export const DEMO_COMPANY = "Northwind Logistics";
export const DEMO_WORKSPACE_NAME = `${DEMO_COMPANY} (demo)`;
const DOMAIN = "northwind.example"; // .example is reserved: these addresses can never receive mail

type DeptKey = "sales" | "mkt" | "eng" | "cs" | "ops" | "fin";

export const DEMO_DEPARTMENTS: { key: DeptKey; name: string; head: string; title: string }[] = [
  { key: "sales", name: "Sales", head: `maria.chen@${DOMAIN}`, title: "VP Sales" },
  { key: "mkt", name: "Marketing", head: `jamal.reed@${DOMAIN}`, title: "Head of Marketing" },
  { key: "eng", name: "Engineering", head: `priya.nair@${DOMAIN}`, title: "CTO" },
  { key: "cs", name: "Customer Success", head: `tom.okafor@${DOMAIN}`, title: "Director of Customer Success" },
  { key: "ops", name: "Operations", head: `lena.vogel@${DOMAIN}`, title: "COO" },
  { key: "fin", name: "Finance", head: `dan.price@${DOMAIN}`, title: "Finance Director" },
];
const headOf = (k: DeptKey) => DEMO_DEPARTMENTS.find((d) => d.key === k)!.head;

// ---------- contracts ----------

interface DemoContract {
  key: string;
  vendor: string;
  agreement: string;
  file: string;
  dept: DeptKey;
  /** Days from today to the last day of the current term. */
  endsIn: number;
  termMonths: number;
  autoRenew: boolean;
  noticeDays: number | null;
  capPct: number | null;
  seatCutPct: number | null;
  fee: number;
  seats: number;
  risks: string[];
  kind?: Extraction["document_kind"];
  escalators?: Extraction["price_escalators"];
}

const CONTRACTS: DemoContract[] = [
  {
    key: "salesforce",
    vendor: "Salesforce, Inc.",
    agreement: "Order Form Q-04417 (Sales Cloud Enterprise)",
    file: "Salesforce_OrderForm_Q-04417.pdf",
    dept: "sales",
    endsIn: 42,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 30,
    capPct: 5,
    seatCutPct: null,
    fee: 319_200,
    seats: 200,
    risks: [
      "The renewal quote is up 9%, above the 5% cap in §7.2.",
      "Seats can't be reduced at renewal without a new order form.",
      "Notice must be in writing to the account executive and legal@salesforce.com.",
    ],
  },
  {
    key: "intercom",
    vendor: "Intercom R&D Unlimited Company",
    agreement: "Subscription Terms + Order IC-88213",
    file: "Intercom_Order_IC-88213.pdf",
    dept: "cs",
    endsIn: 34,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 30,
    capPct: null,
    seatCutPct: null,
    fee: 33_000,
    seats: 15,
    risks: ["Auto-renews with no limit on the price increase.", "Notice deadline is only days away."],
  },
  {
    key: "hubspot",
    vendor: "HubSpot, Inc.",
    agreement: "Marketing Hub Professional Order Form",
    file: "HubSpot_MarketingHub_Pro_2026.pdf",
    dept: "mkt",
    endsIn: 71,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 45,
    capPct: null,
    seatCutPct: null,
    fee: 43_200,
    seats: 12,
    risks: ["No cap on renewal pricing.", "Marketing contact tiers are billed on the highest count in the term."],
    escalators: [
      {
        description: "Renews at HubSpot's then-current list price",
        percent: null,
        frequency: "at_renewal",
        quote: "Renewal fees will be at Vendor's then-current list price unless otherwise agreed in writing.",
        page: 3,
        confidence: "high",
      },
    ],
  },
  {
    key: "looker",
    vendor: "Google LLC (Looker)",
    agreement: "Looker Platform Subscription Order",
    file: "Looker_Subscription_Order.pdf",
    dept: "eng",
    endsIn: 122,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 90,
    capPct: null,
    seatCutPct: 20,
    fee: 60_000,
    seats: 30,
    risks: ["90 days' notice, three times the usual 30.", "No cap on the renewal price."],
  },
  {
    key: "gong",
    vendor: "Gong.io Ltd",
    agreement: "Master Subscription Agreement + Order Form GO-2291",
    file: "Gong_MSA_OrderForm_GO-2291.pdf",
    dept: "sales",
    endsIn: 106,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 60,
    capPct: 7,
    seatCutPct: 10,
    fee: 72_000,
    seats: 60,
    risks: ["60 days' notice.", "Price increases are capped at 7%."],
  },
  {
    key: "zoom",
    vendor: "Zoom Communications, Inc.",
    agreement: "Zoom Workplace Business Plus Order",
    file: "Zoom_Workplace_Order.pdf",
    dept: "sales",
    endsIn: 80,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 30,
    capPct: null,
    seatCutPct: 25,
    fee: 14_400,
    seats: 80,
    risks: ["Operations buys Zoom on a separate contract.", "No cap on renewal pricing."],
  },
  {
    key: "zendesk",
    vendor: "Zendesk, Inc.",
    agreement: "Suite Professional Order Form",
    file: "Zendesk_Suite_Professional.pdf",
    dept: "cs",
    endsIn: 137,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 60,
    capPct: 7,
    seatCutPct: null,
    fee: 52_800,
    seats: 40,
    risks: ["60 days' notice.", "Agent seats can only go up during the term."],
  },
  {
    key: "tableau",
    vendor: "Salesforce, Inc. (Tableau)",
    agreement: "Tableau Cloud Subscription Agreement",
    file: "Tableau_Cloud_Subscription.pdf",
    dept: "fin",
    endsIn: 151,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 60,
    capPct: null,
    seatCutPct: 15,
    fee: 42_000,
    seats: 20,
    risks: ["No cap on renewal pricing.", "Engineering pays for Looker for similar dashboards."],
  },
  {
    key: "monday",
    vendor: "monday.com Ltd",
    agreement: "Pro Plan Annual Subscription",
    file: "monday_Pro_Annual.pdf",
    dept: "ops",
    endsIn: 19,
    termMonths: 12,
    autoRenew: false,
    noticeDays: null,
    capPct: null,
    seatCutPct: null,
    fee: 19_800,
    seats: 55,
    risks: ["Ends soon and does not renew on its own: decide whether to renew or move to Asana."],
  },
  {
    key: "figma",
    vendor: "Figma, Inc.",
    agreement: "Organization Plan Order Form",
    file: "Figma_Organization_Order.pdf",
    dept: "eng",
    endsIn: 198,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 30,
    capPct: 5,
    seatCutPct: null,
    fee: 27_000,
    seats: 45,
    risks: ["Price increases capped at 5%."],
  },
  {
    key: "asana",
    vendor: "Asana, Inc.",
    agreement: "Business Plan Order Form",
    file: "Asana_Business_Order.pdf",
    dept: "mkt",
    endsIn: 166,
    termMonths: 12,
    autoRenew: true,
    noticeDays: 30,
    capPct: null,
    seatCutPct: null,
    fee: 26_400,
    seats: 110,
    risks: ["No cap on renewal pricing."],
  },
];

const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const spell = (n: number) => (n <= 10 ? `${words[n]} (${n})` : `${n}`);
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const money = (n: number) => `USD ${n.toLocaleString("en-US")}`;

function extraction(c: DemoContract, today: string): Extraction {
  const end = addDays(today, c.endsIn);
  const start = addDays(end, -365 + 1);
  const notice = c.noticeDays;
  return {
    vendor: c.vendor,
    agreement_name: c.agreement,
    document_kind: c.kind ?? (/order form/i.test(c.agreement) ? "order_form" : "contract"),
    customer: `${DEMO_COMPANY} Inc.`,
    term_start: start,
    term_end: {
      value: end,
      quote: `The Subscription Term begins on ${longDate(start)} and ends on ${longDate(end)}.`,
      page: 1,
      confidence: "high",
    },
    auto_renewal: {
      value: c.autoRenew,
      renewal_term_months: c.autoRenew ? c.termMonths : null,
      quote: c.autoRenew
        ? `This Order Form will automatically renew for successive ${c.termMonths}-month terms unless either party gives written notice of non-renewal at least ${notice} days before the end of the then-current term.`
        : "This subscription ends at the end of the Subscription Term and does not renew automatically. Renewal requires a new order.",
      page: 2,
      confidence: "high",
    },
    notice_period_days: {
      value: notice,
      quote: notice ? `...written notice of non-renewal at least ${notice} days before the end of the then-current term.` : null,
      page: notice ? 2 : null,
      confidence: notice ? "high" : "medium",
    },
    uplift_cap_percent: {
      value: c.capPct,
      quote:
        c.capPct != null
          ? `§7.2 Renewal Pricing. Fees for any renewal term will not increase by more than ${c.capPct} percent (${c.capPct}%) over the fees for the prior term.`
          : "Renewal fees will be at Vendor's then-current list price unless otherwise agreed in writing.",
      page: 3,
      confidence: c.capPct != null ? "high" : "medium",
    },
    seat_reduction_percent: {
      value: c.seatCutPct,
      quote:
        c.seatCutPct != null
          ? `Customer may reduce the number of licensed users by up to ${c.seatCutPct} percent (${c.seatCutPct}%), effective at the start of a renewal term.`
          : null,
      page: c.seatCutPct != null ? 3 : null,
      confidence: c.seatCutPct != null ? "high" : "low",
    },
    annual_fee: { value: c.fee, quote: `Annual Subscription Fee: ${money(c.fee)}`, page: 4, confidence: "high" },
    seats: { value: c.seats, quote: `Licensed users: ${spell(c.seats)}`, page: 4, confidence: "high" },
    currency: "USD",
    price_escalators: c.escalators ?? [],
    // Sample quotes count as found in the document, so the review flow on the contract page looks as it does for real uploads.
    verified: {
      term_end: true,
      auto_renewal: true,
      notice_period_days: Boolean(notice),
      uplift_cap_percent: c.capPct != null,
      seat_reduction_percent: c.seatCutPct != null,
      annual_fee: true,
      seats: true,
    },
    risks: c.risks,
  };
}

// ---------- tools and survey answers ----------

interface DemoTool {
  key: string;
  name: string;
  category: string;
  dept: DeptKey;
  contract?: string;
  cost: number;
  seats: number;
  /** Renewal for tools without an uploaded contract, days from today. */
  renewsIn?: number;
  source: "upload" | "import" | "manual";
  confirmed: boolean;
  survey?: [purpose: string, criticality: number, replacement: string | null, noReplacement: boolean, seats: "all" | "some" | "unsure", count: number | null];
}

const TOOLS: DemoTool[] = [
  { key: "salesforce", name: "Salesforce Sales Cloud", category: "CRM & sales", dept: "sales", contract: "salesforce", cost: 319_200, seats: 200, source: "upload", confirmed: true,
    survey: ["System of record for pipeline, forecasting and quotes.", 5, null, false, "some", 170] },
  { key: "gong", name: "Gong", category: "CRM & sales", dept: "sales", contract: "gong", cost: 72_000, seats: 60, source: "upload", confirmed: true,
    survey: ["Call recording and coaching for the account executives.", 3, "Zoom recordings + Salesforce notes", false, "some", 40] },
  { key: "zoom-sales", name: "Zoom", category: "Video meetings", dept: "sales", contract: "zoom", cost: 14_400, seats: 80, source: "upload", confirmed: true,
    survey: ["Customer demos and discovery calls.", 4, "Google Meet", false, "all", null] },
  { key: "hubspot", name: "HubSpot Marketing Hub", category: "Marketing", dept: "mkt", contract: "hubspot", cost: 43_200, seats: 12, source: "upload", confirmed: true,
    survey: ["Email campaigns, landing pages and lead scoring.", 4, null, false, "all", null] },
  { key: "asana", name: "Asana", category: "Project management", dept: "mkt", contract: "asana", cost: 26_400, seats: 110, source: "upload", confirmed: true,
    survey: ["Campaign planning across marketing, sales and ops.", 4, null, false, "all", null] },
  { key: "canva", name: "Canva Teams", category: "Design", dept: "mkt", cost: 3_600, seats: 25, renewsIn: 186, source: "import", confirmed: true,
    survey: ["Social graphics and sales one-pagers.", 2, "Figma", false, "all", null] },
  { key: "figma", name: "Figma", category: "Design", dept: "eng", contract: "figma", cost: 27_000, seats: 45, source: "upload", confirmed: true,
    survey: ["Product design and the design system.", 5, null, false, "some", 35] },
  { key: "jira", name: "Jira Software", category: "Project management", dept: "eng", cost: 31_500, seats: 140, renewsIn: 91, source: "import", confirmed: true,
    survey: ["Sprint planning and bug tracking.", 5, null, false, "all", null] },
  { key: "looker", name: "Looker", category: "Analytics & BI", dept: "eng", contract: "looker", cost: 60_000, seats: 30, source: "upload", confirmed: true,
    survey: ["Product analytics dashboards.", 2, "Tableau", false, "some", 12] },
  { key: "zendesk", name: "Zendesk Suite", category: "Customer support", dept: "cs", contract: "zendesk", cost: 52_800, seats: 40, source: "upload", confirmed: true,
    survey: ["Support tickets and the help centre.", 5, null, false, "all", null] },
  { key: "intercom", name: "Intercom", category: "Customer support", dept: "cs", contract: "intercom", cost: 33_000, seats: 15, source: "upload", confirmed: true,
    survey: ["Chat widget on the pricing page. Mostly unused since we moved chat to Zendesk.", 1, null, true, "unsure", null] },
  { key: "monday", name: "monday.com", category: "Project management", dept: "ops", contract: "monday", cost: 19_800, seats: 55, source: "upload", confirmed: true,
    survey: ["Warehouse rollout tracker.", 2, "Asana", false, "some", 20] },
  { key: "zoom-ops", name: "Zoom", category: "Video meetings", dept: "ops", cost: 6_000, seats: 30, renewsIn: 113, source: "import", confirmed: true,
    survey: ["Weekly calls with the regional depots.", 3, "Google Meet", false, "all", null] },
  { key: "tableau", name: "Tableau", category: "Analytics & BI", dept: "fin", contract: "tableau", cost: 42_000, seats: 20, source: "upload", confirmed: true,
    survey: ["Board reporting and finance dashboards.", 4, null, false, "all", null] },
  // Waiting for Finance to confirm and answer: shows the "needs survey" state.
  { key: "docusign", name: "DocuSign", category: "E-signature", dept: "fin", cost: 9_600, seats: 10, renewsIn: 228, source: "import", confirmed: false },
];

// Earlier terms and renewal quotes for some vendors, so price-hike tracking has something to show.
// Each copies its contract and changes what differs; endsIn is shifted a year back (last term) or forward (quote).
const OTHER_DOCS: (DemoContract & { of: string })[] = [
  {
    ...CONTRACTS.find((c) => c.key === "salesforce")!,
    of: "salesforce",
    key: "salesforce-quote",
    agreement: "Renewal Quote Q-05102 (Sales Cloud Enterprise)",
    file: "Salesforce_RenewalQuote_Q-05102.pdf",
    kind: "renewal_quote",
    endsIn: 42 + 365,
    fee: 347_928,
    risks: ["Quoted at 9% over the current term, above the 5% cap in the order form.", "Quote expires 10 days before the notice deadline."],
  },
  {
    ...CONTRACTS.find((c) => c.key === "hubspot")!,
    of: "hubspot",
    key: "hubspot-quote",
    agreement: "Marketing Hub Professional Renewal Quote",
    file: "HubSpot_Renewal_Quote_2027.pdf",
    kind: "renewal_quote",
    endsIn: 71 + 365,
    fee: 48_384,
    risks: ["12% over the current term.", "The order form has no cap on renewal pricing."],
  },
  {
    ...CONTRACTS.find((c) => c.key === "zendesk")!,
    of: "zendesk",
    key: "zendesk-2025",
    agreement: "Suite Professional Order Form (prior term)",
    file: "Zendesk_Suite_Professional_2025.pdf",
    endsIn: 137 - 365,
    fee: 48_000,
    risks: ["60 days' notice."],
  },
];

// ---------- the whole workspace ----------

export interface DemoRows {
  departments: { id: string; name: string }[];
  invites: { email: string; role: "member"; department_id: string }[];
  contracts: Record<string, unknown>[];
  tools: Record<string, unknown>[];
  surveys: Record<string, unknown>[];
  connections: Record<string, unknown>[];
  signals: Record<string, unknown>[];
  discovered: Record<string, unknown>[];
}

/** Builds every row for a demo workspace. `uuid` makes ids so rows can reference each other before insert. */
export function buildDemoRows(workspaceId: string, today: string, uuid: () => string): DemoRows {
  const now = new Date(today + "T09:00:00Z");
  const at = (daysAgo: number, hour = 9) => new Date(now.getTime() - daysAgo * 86_400_000 + (hour - 9) * 3_600_000).toISOString();

  const deptId = new Map<DeptKey, string>(DEMO_DEPARTMENTS.map((d) => [d.key, uuid()]));
  const departments = DEMO_DEPARTMENTS.map((d) => ({ id: deptId.get(d.key)!, name: d.name, workspace_id: workspaceId, created_at: at(21) }));
  const invites = DEMO_DEPARTMENTS.map((d, i) => ({
    workspace_id: workspaceId,
    email: d.head,
    role: "member" as const,
    department_id: deptId.get(d.key)!,
    created_at: at(20, 10 + i),
  }));

  const contractId = new Map<string, string>();
  const contracts = CONTRACTS.map((c, i) => {
    const id = uuid();
    contractId.set(c.key, id);
    const data = extraction(c, today);
    const deadline = c.autoRenew && c.noticeDays != null ? addDays(data.term_end.value!, -c.noticeDays) : null;
    return {
      id,
      workspace_id: workspaceId,
      uploaded_by: null,
      uploaded_by_email: headOf(c.dept),
      file_name: c.file,
      file_path: null,
      ...extractionColumns(data, deadline),
      extraction: data,
      model: "claude-opus-5-5",
      demo: false,
      created_at: at(18 - (i % 6), 9 + (i % 7)),
    };
  });
  // The prior term was uploaded first; quotes arrived in the last few days.
  for (const [i, c] of OTHER_DOCS.entries()) {
    const data = extraction(c, today);
    contracts.push({
      id: uuid(),
      workspace_id: workspaceId,
      uploaded_by: null,
      uploaded_by_email: headOf(c.dept),
      file_name: c.file,
      file_path: null,
      ...extractionColumns(data, null),
      extraction: data,
      model: "claude-opus-5-5",
      demo: false,
      created_at: c.kind === "renewal_quote" ? at(2 + i, 11) : at(19, 9),
    });
  }

  const toolId = new Map<string, string>();
  const tools = TOOLS.map((t, i) => {
    const id = uuid();
    toolId.set(t.key, id);
    const c = t.contract ? CONTRACTS.find((x) => x.key === t.contract)! : null;
    return {
      id,
      workspace_id: workspaceId,
      department_id: deptId.get(t.dept)!,
      contract_id: t.contract ? contractId.get(t.contract)! : null,
      name: t.name,
      category: t.category,
      description: null,
      annual_cost: t.cost,
      seats: t.seats,
      renewal_date: c ? addDays(today, c.endsIn) : t.renewsIn != null ? addDays(today, t.renewsIn) : null,
      source: t.source,
      confirmed: t.confirmed,
      created_by: null,
      created_at: at(17, 9 + (i % 8)),
      updated_at: at(17, 9 + (i % 8)),
    };
  });

  const surveys = TOOLS.filter((t) => t.survey).map((t, i) => {
    const [purpose, criticality, replacement, none, seats, count] = t.survey!;
    return {
      workspace_id: workspaceId,
      tool_id: toolId.get(t.key)!,
      respondent_id: null,
      respondent_email: headOf(t.dept),
      purpose,
      criticality,
      replacement,
      no_replacement_needed: none,
      seats_needed: seats,
      seats_needed_count: count,
      created_at: at(12 - (i % 9), 10 + (i % 6)),
    };
  });

  const providers = Object.keys(SAMPLE_SIGNALS) as ProviderId[];
  const connections = providers.map((p) => {
    const sig = SAMPLE_SIGNALS[p];
    return {
      workspace_id: workspaceId,
      provider: p,
      status: "connected",
      account_name: SAMPLE_ACCOUNT[p],
      external_id: null,
      last_synced_at: at(0, 7),
      last_error: null,
      summary: {
        tools: sig.length,
        spend: sig.reduce((s, x) => s + (x.annual_spend ?? 0), 0) || undefined,
        users: Math.max(0, ...sig.map((x) => x.users ?? 0)) || undefined,
      },
      connected_by: null,
      created_at: at(21),
      updated_at: at(0, 7),
    };
  });
  const signals = providers.flatMap((p) => SAMPLE_SIGNALS[p].map((s) => ({ ...s, workspace_id: workspaceId, created_at: at(0, 7) })));

  // Discovered vendors that are already on the tool list show as "added"; the rest (Slack, Notion, Loom, ChatGPT…) wait for review.
  const toolByVendor = new Map<string, string>();
  for (const t of TOOLS) if (!toolByVendor.has(matchVendor(t.name).key)) toolByVendor.set(matchVendor(t.name).key, toolId.get(t.key)!);
  const vendorKeys = Array.from(new Set(signals.map((s) => s.vendor_key)));
  const discovered = vendorKeys
    .filter((k) => toolByVendor.has(k))
    .map((k) => {
      const tool = tools.find((t) => t.id === toolByVendor.get(k))!;
      return { workspace_id: workspaceId, vendor_key: k, status: "imported", department_id: tool.department_id, department_set: false, tool_id: tool.id, updated_at: at(16) };
    });

  return { departments, invites, contracts, tools, surveys, connections, signals, discovered };
}
