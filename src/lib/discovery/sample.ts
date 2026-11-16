// What the four sources "find" in demo mode (no Supabase), for the fictional Northwind Logistics.
import { addDays, sampleDate, TODAY } from "@/lib/engine";
import { matchVendor } from "./catalog";

const LAST_PAYMENT = sampleDate("2026-11-01");
const lastPaymentLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(LAST_PAYMENT + "T00:00:00Z"));
import { ACTIVE_DAYS, type IdlePerson, type ProviderId, type Signal } from "./types";

type Spend = [name: string, annual: number, payments: number, cadence: Signal["cadence"]];
/** [name, people who signed in during the window, by department, paid licences, signed in during the last 30 days, days since the latest sign-in] */
type Usage = [name: string, users: number, depts: Record<string, number> | null, licensed: number | null, active: number, lastDaysAgo: number];

const spend = (provider: ProviderId, [raw, annual, payments, cadence]: Spend): Signal => {
  const m = matchVendor(raw);
  return {
    provider,
    vendor_key: m.key,
    name: m.name,
    category: m.category,
    dept_hint: m.dept,
    kind: "spend",
    annual_spend: annual,
    payment_count: payments,
    last_seen: LAST_PAYMENT,
    cadence,
    currency: "USD",
    users: null,
    licensed: null,
    dept_counts: null,
    evidence: `${payments} payment${payments === 1 ? "" : "s"} in 12 months, last on ${lastPaymentLabel} (${cadence})`,
  };
};

const FIRST = ["alex", "sam", "jordan", "taylor", "morgan", "casey", "riley", "jamie", "avery", "quinn", "drew", "robin", "kai", "noa", "eli", "rene"];
const LAST = ["novak", "berg", "ortiz", "keller", "haas", "lund", "moreau", "silva", "petrov", "hughes", "osei", "tanaka", "costa", "frank"];

/** Made-up people at northwind.example (reserved, never receives mail) who went quiet, oldest first. */
function idlePeople(vendorKey: string, n: number, windowDays: number, never = 0): IdlePerson[] {
  const seed = [...vendorKey].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  let i = 0;
  // Steps through the 16 × 14 first/last pairs, so names never repeat within one app.
  const person = () => {
    const k = (seed + 17 * i++) % (FIRST.length * LAST.length); // 17 is coprime with 224: every pair once
    return `${FIRST[k % FIRST.length]}.${LAST[Math.floor(k / FIRST.length)]}@northwind.example`;
  };
  const out: IdlePerson[] = Array.from({ length: never }, () => ({ email: person(), last: "" }));
  const span = windowDays - ACTIVE_DAYS - 1;
  const quiet = Array.from({ length: n }, (_, i) => ({ email: person(), last: addDays(TODAY, -(windowDays - 1 - Math.floor((i * span) / Math.max(1, n)))) }));
  return [...out, ...quiet].slice(0, 100);
}

const usage = (provider: ProviderId, days: number, [raw, users, depts, licensed, active, lastDaysAgo]: Usage): Signal => {
  const m = matchVendor(raw);
  return {
    provider,
    vendor_key: m.key,
    name: m.name,
    category: m.category,
    dept_hint: m.dept,
    kind: "usage",
    annual_spend: null,
    payment_count: null,
    last_seen: null,
    cadence: null,
    currency: null,
    users,
    licensed,
    dept_counts: depts,
    evidence: licensed ? `${users} of ${licensed} accounts signed in, last ${days} days` : `${users} people signed in, last ${days} days`,
    active_users: active,
    last_login: addDays(TODAY, -lastDaysAgo),
    window_days: days,
    idle_people: idlePeople(m.key, users - active, days, m.key === "google-workspace" && licensed ? licensed - users : 0),
  };
};

const QB: Spend[] = [
  ["SALESFORCE.COM INC", 312_000, 12, "monthly"],
  ["Gong.io Inc", 72_000, 1, "annual"],
  ["Zendesk Inc", 52_800, 12, "monthly"],
  ["HubSpot Inc", 43_200, 1, "annual"],
  ["SLACK T0123ABCD DUBLIN", 41_280, 12, "monthly"],
  ["Atlassian Pty Ltd", 31_500, 12, "monthly"],
  ["Figma Inc", 27_000, 1, "annual"],
  ["Asana Inc", 26_400, 12, "monthly"],
  ["monday.com Ltd", 19_800, 12, "monthly"],
  ["ZOOM.US 888-799-9666", 14_400, 12, "monthly"],
  ["Notion Labs Inc", 9_600, 12, "monthly"],
  ["Canva Pty Ltd", 3_600, 1, "annual"],
  ["Loom Inc", 3_000, 12, "monthly"],
];

const XERO: Spend[] = [
  ["Webflow Inc", 4_800, 12, "monthly"],
  ["Calendly LLC", 2_400, 12, "monthly"],
  ["Typeform SL", 1_200, 12, "monthly"],
];

const GOOGLE: Usage[] = [
  ["Google Workspace", 231, null, 248, 219, 0],
  ["Slack", 214, { Sales: 70, Engineering: 48, "Customer Success": 40, Marketing: 22, Operations: 20, Finance: 14 }, null, 203, 0],
  ["Salesforce", 181, { Sales: 160, "Customer Success": 14, Marketing: 7 }, null, 166, 0],
  ["Atlassian Jira", 131, { Engineering: 118, Operations: 13 }, null, 124, 0],
  ["Notion", 118, { Engineering: 52, Marketing: 30, Operations: 22, Sales: 14 }, null, 104, 0],
  ["Zoom", 104, { Sales: 62, Operations: 24, "Customer Success": 14, Marketing: 4 }, null, 96, 0],
  ["Asana", 92, { Marketing: 40, Operations: 34, Sales: 18 }, null, 81, 1],
  ["ChatGPT", 64, { Engineering: 20, Marketing: 18, Sales: 16, Operations: 10 }, null, 58, 0],
  ["Loom", 41, { Sales: 25, "Customer Success": 9, Marketing: 7 }, null, 30, 1],
  ["Figma", 38, { Engineering: 30, Marketing: 8 }, null, 33, 0],
  ["monday.com", 26, { Operations: 26 }, null, 17, 3],
  ["Calendly", 25, { Sales: 22, "Customer Success": 3 }, null, 22, 0],
  ["Miro", 22, { Engineering: 12, Operations: 6, Marketing: 4 }, null, 15, 2],
  ["Canva", 19, { Marketing: 19 }, null, 16, 1],
  ["Looker", 14, { Engineering: 14 }, null, 9, 4],
  ["HubSpot", 12, { Marketing: 11, Sales: 1 }, null, 12, 0],
  ["Intercom", 5, { "Customer Success": 5 }, null, 2, 12],
];

const MICROSOFT: Usage[] = [
  ["Gong", 44, { Sales: 42, "Customer Success": 2 }, null, 44, 0],
  ["Zendesk", 38, { "Customer Success": 35, Operations: 3 }, null, 38, 0],
  ["Tableau", 13, { Finance: 11, Operations: 2 }, null, 13, 1],
  ["Power BI", 12, { Finance: 9, Operations: 3 }, 20, 12, 0],
  ["DocuSign", 8, { Finance: 8 }, null, 8, 2],
];

export const SAMPLE_SIGNALS: Record<ProviderId, Signal[]> = {
  quickbooks: QB.map((r) => spend("quickbooks", r)),
  xero: XERO.map((r) => spend("xero", r)),
  google: GOOGLE.map((r) => usage("google", 90, r)),
  microsoft: MICROSOFT.map((r) => usage("microsoft", 30, r)),
};

export const SAMPLE_ACCOUNT: Record<ProviderId, string> = {
  quickbooks: "Northwind Logistics Inc.",
  xero: "Northwind Logistics UK Ltd",
  google: "northwind.example",
  microsoft: "Northwind (Entra ID)",
};
