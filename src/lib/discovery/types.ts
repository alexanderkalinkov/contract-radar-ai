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
  // Login activity (identity sources, added in 20261116213000_seat_usage.sql; null on older rows and spend rows)
  /** People who signed in during the last ACTIVE_DAYS (30) days. Null when the source only knows assignments. */
  active_users?: number | null;
  /** Most recent sign-in by anyone, YYYY-MM-DD. */
  last_login?: string | null;
  /** How many days of sign-in history the source looked at (Google 90, Microsoft 30). */
  window_days?: number | null;
  /** People who signed in during the window but not in the last ACTIVE_DAYS, oldest first (capped). */
  idle_people?: IdlePerson[] | null;
}

export interface IdlePerson {
  email: string;
  last: string; // YYYY-MM-DD of their last sign-in
}

/** A seat counts as active when its person signed in within this many days. */
export const ACTIVE_DAYS = 30;
/** How many idle people a signal keeps, so a sync row stays small. */
export const IDLE_PEOPLE_CAP = 100;

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

/** The login columns from 20261116213000_seat_usage.sql. */
export const LOGIN_COLUMNS = ["active_users", "last_login", "window_days", "idle_people"] as const;

export const isMissingUsageColumn = (msg: string) => /active_users|last_login|window_days|idle_people/.test(msg) && /column|schema cache/i.test(msg);

export function withoutLoginFields<T extends object>(row: T): Omit<T, (typeof LOGIN_COLUMNS)[number]> {
  const copy = { ...row } as Record<string, unknown>;
  for (const c of LOGIN_COLUMNS) delete copy[c];
  return copy as Omit<T, (typeof LOGIN_COLUMNS)[number]>;
}
