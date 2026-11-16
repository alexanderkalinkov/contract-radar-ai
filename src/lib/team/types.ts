// Team onboarding: departments, department owners, the tool inventory and the tool survey.

export type Role = "owner" | "member"; // owner = admin / C-level, member = department owner

export interface Department {
  id: string;
  name: string;
  sample?: boolean;
}

export interface TeamMember {
  user_id: string;
  email: string;
  role: Role;
  department_id: string | null;
  job_title: string | null;
  created_at: string;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: Role;
  department_id: string | null;
  created_at: string;
}

export interface Tool {
  id: string;
  name: string;
  category: string;
  description: string | null;
  department_id: string | null;
  contract_id: string | null;
  annual_cost: number | null;
  seats: number | null;
  renewal_date: string | null;
  source: "manual" | "upload" | "import";
  confirmed: boolean;
  created_at: string;
  sample?: boolean;
}

export type SeatsNeeded = "all" | "some" | "unsure";

export interface Survey {
  id: string;
  tool_id: string;
  respondent_email: string | null;
  purpose: string;
  criticality: number;
  replacement: string | null;
  no_replacement_needed: boolean;
  seats_needed: SeatsNeeded;
  seats_needed_count: number | null;
  created_at: string;
}

export interface TeamData {
  workspace: { name: string; company_size: string | null; onboarded_at: string | null };
  me: { user_id: string; email: string; role: Role; department_id: string | null; job_title: string | null };
  departments: Department[];
  members: TeamMember[];
  invites: TeamInvite[];
  tools: Tool[];
  surveys: Survey[];
}

export type ToolInput = Partial<Pick<Tool, "name" | "category" | "description" | "department_id" | "annual_cost" | "seats" | "renewal_date" | "confirmed">>;

export type SurveyInput = Pick<Survey, "purpose" | "criticality" | "replacement" | "no_replacement_needed" | "seats_needed" | "seats_needed_count">;

/** Operations the client sends to POST /api/team (and that demo mode applies to localStorage). */
export type TeamOp =
  | { op: "setup"; name?: string; company_size?: string | null; job_title?: string | null; onboarded?: boolean }
  | { op: "addDepartments"; names: string[] }
  | { op: "renameDepartment"; id: string; name: string }
  | { op: "deleteDepartment"; id: string }
  | { op: "updateMember"; user_id: string; department_id?: string | null; role?: Role }
  | { op: "invite"; email: string; department_id: string | null; role: Role }
  | { op: "cancelInvite"; id: string }
  | { op: "addTool"; tool: ToolInput & { name: string } }
  /** Demo mode only: tools found by auto-discovery (the cloud uses POST /api/discovery). */
  | { op: "importTools"; tools: (ToolInput & { name: string; id: string })[] }
  | { op: "updateTool"; id: string; tool: ToolInput }
  | { op: "deleteTool"; id: string }
  | { op: "answerSurvey"; tool_id: string; answers: SurveyInput };

export interface OpResult {
  ok: boolean;
  error?: string;
  /** For invites: whether an email went out, and if not, why. */
  emailed?: boolean;
  emailNote?: string;
  id?: string;
}

export const COMPANY_SIZES = ["1–49", "50–199", "200–499", "500–999", "1,000+"];

export const PRESET_DEPARTMENTS = [
  "Sales",
  "Marketing",
  "Engineering",
  "Product",
  "Customer Success",
  "Finance",
  "People & HR",
  "Operations",
  "IT & Security",
  "Legal",
];

export const CATEGORIES = [
  "Project management",
  "CRM & sales",
  "Customer support",
  "Chat & email",
  "Video meetings",
  "Docs & knowledge",
  "Design",
  "Analytics & BI",
  "Developer tools",
  "Marketing",
  "Finance & accounting",
  "HR & people",
  "Security & IT",
  "Storage & files",
  "E-signature",
  "Other",
];

const VENDOR_CATEGORY: [RegExp, string][] = [
  [/asana|monday|jira|trello|clickup|basecamp|smartsheet|wrike|linear|notion projects/i, "Project management"],
  [/salesforce|hubspot crm|pipedrive|close\.com|zoho crm|gong|outreach|salesloft|apollo/i, "CRM & sales"],
  [/zendesk|intercom|freshdesk|front|help ?scout|gorgias/i, "Customer support"],
  [/slack|teams|google chat|outlook|superhuman/i, "Chat & email"],
  [/zoom|webex|gotomeeting|google meet|loom/i, "Video meetings"],
  [/confluence|notion|coda|guru|google workspace|microsoft 365|office 365|dropbox paper/i, "Docs & knowledge"],
  [/figma|canva|adobe|sketch|miro|invision/i, "Design"],
  [/tableau|looker|power bi|mixpanel|amplitude|metabase|snowflake|segment/i, "Analytics & BI"],
  [/github|gitlab|bitbucket|datadog|sentry|vercel|aws|atlassian|jetbrains|postman|new relic|pagerduty/i, "Developer tools"],
  [/hubspot|marketo|mailchimp|semrush|hootsuite|sprout|ahrefs|braze|klaviyo/i, "Marketing"],
  [/quickbooks|xero|netsuite|bill\.com|expensify|ramp|brex|stripe|avalara|carta/i, "Finance & accounting"],
  [/workday|bamboohr|gusto|rippling|deel|lattice|greenhouse|lever|culture amp|hibob/i, "HR & people"],
  [/okta|1password|lastpass|crowdstrike|jamf|kandji|vanta|drata/i, "Security & IT"],
  [/dropbox|box|google drive|onedrive|egnyte/i, "Storage & files"],
  [/docusign|pandadoc|adobe sign|hellosign|dropbox sign/i, "E-signature"],
];

export function guessCategory(name: string): string {
  for (const [re, cat] of VENDOR_CATEGORY) if (re.test(name)) return cat;
  return "Other";
}

export const roleLabel = (m: { role: Role; department_id: string | null }) =>
  m.role === "owner" ? "Admin" : m.department_id ? "Department owner" : "Member";
