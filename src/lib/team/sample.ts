// Sample team for the fictional Northwind Logistics, shown when "sample data" is on.
// Read-only: it never reaches the database.
import { sampleDate } from "@/lib/engine";
import type { Department, Survey, Tool } from "./types";

export const SAMPLE_DEPARTMENTS: Department[] = [
  { id: "s-sales", name: "Sales", sample: true },
  { id: "s-mkt", name: "Marketing", sample: true },
  { id: "s-eng", name: "Engineering", sample: true },
  { id: "s-cs", name: "Customer Success", sample: true },
  { id: "s-ops", name: "Operations", sample: true },
  { id: "s-fin", name: "Finance", sample: true },
];

type Row = [id: string, name: string, category: string, dept: string, cost: number, seats: number, renewal: string];

const ROWS: Row[] = [
  ["s-t-salesforce", "Salesforce Sales Cloud", "CRM & sales", "s-sales", 319_200, 200, sampleDate("2026-12-31")],
  ["s-t-gong", "Gong", "CRM & sales", "s-sales", 72_000, 60, sampleDate("2027-03-01")],
  ["s-t-zoom-sales", "Zoom", "Video meetings", "s-sales", 14_400, 80, sampleDate("2027-01-15")],
  ["s-t-hubspot", "HubSpot Marketing Hub", "Marketing", "s-mkt", 43_200, 12, sampleDate("2027-02-01")],
  ["s-t-asana", "Asana", "Project management", "s-mkt", 26_400, 110, sampleDate("2027-04-30")],
  ["s-t-canva", "Canva Teams", "Design", "s-mkt", 3_600, 25, sampleDate("2027-05-20")],
  ["s-t-figma", "Figma", "Design", "s-eng", 27_000, 45, sampleDate("2027-06-01")],
  ["s-t-jira", "Jira Software", "Project management", "s-eng", 31_500, 140, sampleDate("2027-02-15")],
  ["s-t-looker", "Looker", "Analytics & BI", "s-eng", 60_000, 30, sampleDate("2027-01-31")],
  ["s-t-zendesk", "Zendesk Suite", "Customer support", "s-cs", 52_800, 40, sampleDate("2027-03-31")],
  ["s-t-intercom", "Intercom", "Customer support", "s-cs", 33_000, 15, sampleDate("2026-12-20")],
  ["s-t-monday", "monday.com", "Project management", "s-ops", 19_800, 55, sampleDate("2026-12-05")],
  ["s-t-zoom-ops", "Zoom", "Video meetings", "s-ops", 6_000, 30, sampleDate("2027-03-10")],
  ["s-t-tableau", "Tableau", "Analytics & BI", "s-fin", 42_000, 20, sampleDate("2027-01-10")],
  ["s-t-docusign", "DocuSign", "E-signature", "s-fin", 9_600, 10, sampleDate("2027-07-01")],
];

export const SAMPLE_TOOLS: Tool[] = ROWS.map(([id, name, category, dept, cost, seats, renewal]) => ({
  id,
  name,
  category,
  description: null,
  department_id: dept,
  contract_id: null,
  annual_cost: cost,
  seats,
  renewal_date: renewal,
  source: "import",
  confirmed: true,
  created_at: sampleDate("2026-11-01") + "T09:00:00Z",
  sample: true,
}));

type S = [tool: string, purpose: string, crit: number, replacement: string | null, none: boolean, seats: Survey["seats_needed"], count: number | null];

const ANSWERS: S[] = [
  ["s-t-salesforce", "System of record for pipeline, forecasting and quotes.", 5, null, false, "some", 170],
  ["s-t-gong", "Call recording and coaching for the AE team.", 3, "Zoom recordings + Salesforce notes", false, "some", 40],
  ["s-t-zoom-sales", "Customer demos and discovery calls.", 4, "Google Meet", false, "all", null],
  ["s-t-hubspot", "Email campaigns and landing pages.", 4, null, false, "all", null],
  ["s-t-asana", "Campaign planning across marketing, sales and ops.", 4, null, false, "all", null],
  ["s-t-canva", "Social graphics.", 2, "Figma", false, "all", null],
  ["s-t-figma", "Product design and design system.", 5, null, false, "some", 35],
  ["s-t-jira", "Sprint planning and bug tracking.", 5, null, false, "all", null],
  ["s-t-looker", "Product analytics dashboards.", 2, "Tableau", false, "some", 12],
  ["s-t-zendesk", "Support tickets and help centre.", 5, null, false, "all", null],
  ["s-t-intercom", "Chat widget on the pricing page; mostly unused since Zendesk chat.", 1, null, true, "unsure", null],
  ["s-t-monday", "Warehouse rollout tracker.", 2, "Asana", false, "some", 20],
  ["s-t-zoom-ops", "Weekly site calls.", 3, "Google Meet", false, "all", null],
  ["s-t-tableau", "Board reporting and finance dashboards.", 4, null, false, "all", null],
];

export const SAMPLE_SURVEYS: Survey[] = ANSWERS.map(([tool, purpose, crit, replacement, none, seats, count]) => ({
  id: `sv-${tool}`,
  tool_id: tool,
  respondent_email: "owner@northwind.example",
  purpose,
  criticality: crit,
  replacement,
  no_replacement_needed: none,
  seats_needed: seats,
  seats_needed_count: count,
  created_at: sampleDate("2026-11-05") + "T09:00:00Z",
}));
