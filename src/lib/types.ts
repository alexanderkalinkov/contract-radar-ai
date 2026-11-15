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
  active: number; // signed in within 60 days
  inactive: number; // 60+ days since last sign-in
  neverSignedIn: number;
  source: string; // e.g. "Okta"
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
