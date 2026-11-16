// Core entities, mirroring section 4 of docs/dashboard-spec.md.
// Dates are ISO strings (YYYY-MM-DD). Money is annual USD unless named otherwise.

export type Confidence = "high" | "medium" | "low";

export type LeverKey = "seats" | "price" | "dup" | "terms";

export interface Clause {
  ref: string; // e.g. "§8.2"
  title: string;
  document: string;
  page: number;
  confidence: Confidence;
  quote: string;
  meaning: string;
}

export interface SeatUsage {
  paid: number;
  active: number; // signed in within activeDays (60 in the sample portfolio, 30 from live sign-ins)
  inactive: number; // signed in during the window, but not within activeDays
  neverSignedIn: number; // no sign-in at all during the window (or ever, in the sample portfolio)
  source: string; // e.g. "Okta"
  /** Days that count as active. Missing = 60 (sample portfolio). */
  activeDays?: number;
  /** Days of sign-in history the source covers. Missing = all time. */
  windowDays?: number;
  /** Latest sign-in by anyone, YYYY-MM-DD. */
  lastLogin?: string | null;
  /** People who stopped signing in, oldest first ("" = not in the window at all). */
  idle?: { email: string; last: string }[];
  /** From a connected Google Workspace or Microsoft sync (or the demo workspace's), not the sample portfolio. */
  live?: boolean;
}

export interface Quote {
  receivedOn: string;
  annualFee: number;
  expiresOn?: string;
}

export interface Contract {
  id: string;
  vendor: string;
  product: string;
  initials: string;
  hue: string;
  category: string;
  owner: string;
  documents: string[];
  pages: number;
  termEnd: string; // last day of the current term
  autoRenew: boolean;
  renewalTermMonths: number;
  noticeDays: number;
  upliftCapPct: number | null;
  seatReductionPct: number | null;
  annualFee: number;
  seats: number;
  quote?: Quote;
  usage?: SeatUsage;
  clauses: Clause[];
  /** Set when the finding is "retire this tool and move users to another one". */
  consolidation?: { keepVendor: string; movedUsers: number; extraCost: number };
  deadlineLabel: string; // what happens on the act-by date
  /** True for contracts the user uploaded (as opposed to sample data). */
  uploaded?: boolean;
  /** Uploaded contracts carry the deadline computed at extraction time (null when not found). */
  noticeDeadlineOverride?: string | null;
}

export interface Opportunity {
  id: string;
  contractId: string;
  vendor: string;
  initials: string;
  hue: string;
  lever: LeverKey;
  finding: string;
  annualSavings: number;
  estimate?: boolean; // "up to" amounts
  actBy: string;
  action: string;
}

export interface Source {
  id: string;
  group: "identity" | "spend";
  name: string;
  initials: string;
  hue: string;
  what: string;
  connectedSummary: string;
  connected: boolean;
  lastSync?: string;
}
