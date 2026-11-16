// What the four sources "find" in demo mode (no Supabase), for the fictional Northwind Logistics.
import { matchVendor } from "./catalog";
import type { ProviderId, Signal } from "./types";

type Spend = [name: string, annual: number, payments: number, cadence: Signal["cadence"]];
type Usage = [name: string, users: number, depts: Record<string, number> | null, licensed?: number];

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
    last_seen: "2026-11-01",
    cadence,
    currency: "USD",
    users: null,
    licensed: null,
    dept_counts: null,
    evidence: `${payments} payment${payments === 1 ? "" : "s"} in 12 months, last on 1 Nov 2026 (${cadence})`,
  };
};

const usage = (provider: ProviderId, days: number, [raw, users, depts, licensed]: Usage): Signal => {
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
    licensed: licensed ?? null,
    dept_counts: depts,
    evidence: licensed ? `${users} of ${licensed} accounts signed in, last ${days} days` : `${users} people signed in, last ${days} days`,
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
  ["Google Workspace", 231, null, 248],
  ["Slack", 214, { Sales: 70, Engineering: 48, "Customer Success": 40, Marketing: 22, Operations: 20, Finance: 14 }],
  ["Zoom", 162, { Sales: 64, "Customer Success": 38, Operations: 30, Marketing: 18, Finance: 12 }],
  ["Notion", 118, { Engineering: 52, Marketing: 30, Operations: 22, Sales: 14 }],
  ["Salesforce", 88, { Sales: 72, "Customer Success": 10, Marketing: 6 }],
  ["ChatGPT", 64, { Engineering: 20, Marketing: 18, Sales: 16, Operations: 10 }],
  ["Loom", 41, { Sales: 25, "Customer Success": 9, Marketing: 7 }],
  ["Figma", 31, { Engineering: 22, Marketing: 9 }],
  ["Calendly", 25, { Sales: 22, "Customer Success": 3 }],
  ["Miro", 22, { Engineering: 12, Operations: 6, Marketing: 4 }],
  ["HubSpot", 14, { Marketing: 12, Sales: 2 }],
];

const MICROSOFT: Usage[] = [
  ["Gong", 52, { Sales: 50, "Customer Success": 2 }],
  ["Zendesk", 38, { "Customer Success": 35, Operations: 3 }],
  ["Power BI", 12, { Finance: 9, Operations: 3 }, 20],
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
