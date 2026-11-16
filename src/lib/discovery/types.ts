// Auto-discovery: tools found in accounting (QuickBooks, Xero) and sign-in data (Google Workspace, Microsoft Entra ID).

export type ProviderId = "quickbooks" | "xero" | "google" | "microsoft";

export const PROVIDERS: { id: ProviderId; name: string; kind: "spend" | "usage"; what: string; initials: string; hue: string }[] = [
  { id: "quickbooks", name: "QuickBooks Online", kind: "spend", what: "Recurring software vendors and what you pay them", initials: "QB", hue: "#2CA01C" },
  { id: "xero", name: "Xero", kind: "spend", what: "Recurring software vendors and what you pay them", initials: "X", hue: "#13B5EA" },
  { id: "google", name: "Google Workspace", kind: "usage", what: "Apps people sign in to with Google, and how many", initials: "G", hue: "#4285F4" },
  { id: "microsoft", name: "Microsoft 365 / Entra ID", kind: "usage", what: "Apps people sign in to with Microsoft, plus M365 licences", initials: "M", hue: "#0078D4" },
];

export const providerName = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)?.name ?? id;

/** One provider's evidence for one vendor. Rebuilt from scratch on every sync of that provider. */
export interface Signal {
  provider: ProviderId;
  vendor_key: string;
  name: string;
  category: string;
  /** Canonical department group from the catalogue or Claude, e.g. "Sales". */
  dept_hint: string | null;
  kind: "spend" | "usage";
  // Spend (accounting)
  annual_spend: number | null;
  payment_count: number | null;
  last_seen: string | null; // YYYY-MM-DD
  cadence: "monthly" | "quarterly" | "annual" | "irregular" | null;
  currency: string | null;
  // Usage (identity)
  users: number | null; // distinct people who signed in during the window
  licensed: number | null; // paid licences, when the source knows (Microsoft 365, Google Workspace)
  /** People per department label from the directory, e.g. { "Sales": 8, "Marketing": 2 }. */
  dept_counts: Record<string, number> | null;
  evidence: string | null; // short human note, e.g. "12 payments, last on 3 Nov 2026"
}

export interface ConnectionInfo {
  provider: ProviderId;
  status: "connected" | "error";
  account_name: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  summary: { tools?: number; spend?: number; users?: number } | null;
}

/** Review state an admin sets per vendor. Missing = new. */
export interface DiscoveryState {
  vendor_key: string;
  status: "new" | "imported" | "dismissed";
  department_id: string | null;
  department_set: boolean; // true once an admin picked the department by hand
  tool_id: string | null;
}

/** What the review screen shows: every signal for a vendor merged, with a suggested department. */
export interface DiscoveredItem {
  vendor_key: string;
  name: string;
  category: string;
  sources: Signal[];
  annual_spend: number | null;
  users: number | null;
  licensed: number | null;
  department_id: string | null;
  department_reason: string;
  status: DiscoveryState["status"];
  tool_id: string | null;
  /** An existing tool with the same name, if any: importing links to it instead of adding a duplicate. */
  existing_tool_id: string | null;
}

export interface DiscoveryData {
  /** Which providers have their client ID and secret set on the server. */
  configured: Record<ProviderId, boolean>;
  /** Missing server settings that block connecting at all (e.g. the encryption key). */
  blockers: string[];
  connections: ConnectionInfo[];
  signals: Signal[];
  states: DiscoveryState[];
}

export type DiscoveryOp =
  | { op: "import"; items: { vendor_key: string; department_id: string | null }[] }
  | { op: "dismiss"; vendor_keys: string[] }
  | { op: "restore"; vendor_keys: string[] }
  | { op: "setDepartment"; vendor_key: string; department_id: string | null };
