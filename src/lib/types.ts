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
  /** True for contracts the user uploaded (as opposed to sample data). */
  uploaded?: boolean;
  /** Uploaded contracts carry the deadline computed at extraction time (null when not found). */
  noticeDeadlineOverride?: string | null;
  /** Price change against the previous document for the same vendor (uploaded contracts; see price-history.ts). */
  priceChange?: PriceChange;
  /** Clauses that raise the price automatically (annual uplift, CPI, list price at renewal). */
  escalators?: PriceEscalator[];
}

export interface PriceEscalator {
  description: string;
  percent: number | null;
  frequency: "annual" | "at_renewal" | "other";
  quote: string | null;
  page: number | null;
}

/** A renewal price compared with the price before it. Money is per year, in the documents' currency. */
export interface PriceChange {
  /** "quote": the vendor's renewal quote vs. the current contract. "renewal": a signed renewal vs. the one before. */
  source: "quote" | "renewal";
  contractId: string; // the contract this change is shown on
  previousId: string | null;
  newId: string | null;
  previousDoc: string;
  newDoc: string;
  receivedOn: string; // when the newer document arrived
  currency: string | null;
  previousFee: number;
  newFee: number;
  deltaAbs: number;
  deltaPct: number; // one decimal
  previousSeats: number | null;
  newSeats: number | null;
  perSeatPrevious: number | null;
  perSeatNew: number | null;
  perSeatPct: number | null;
  /** Cap from the earlier document, which governs the renewal. */
  capPct: number | null;
  cappedFee: number | null;
  overCap: number; // 0 when within the cap or no cap
  /** Notice deadline that decides whether there is still time to push back. */
  actBy: string;
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
