// Savings opportunities found in a contract the team uploaded, using only what the contract itself says.
// Sample opportunities (seed.ts) also use seat logins and quotes; uploaded contracts don't have those yet,
// so these amounts are "up to" estimates and the assumptions are spelled out where they're shown.
import type { SavedContract } from "./saved";
import { hueFor, initialsFor } from "./saved";
import type { Opportunity } from "./types";

/** A typical list-price increase at renewal when nothing in the contract limits it. */
export const ASSUMED_UPLIFT_PCT = 7;
/** The cap we suggest asking for. */
export const TARGET_CAP_PCT = 3;

export type EmailGoal = "cap" | "seats" | "cancel" | "review";

export interface UploadedOpportunity extends Opportunity {
  /** Which pushback email fits this opportunity. */
  goal: EmailGoal;
  /** Plain-English basis for the amount, shown next to it. */
  basis: string;
}

export function opportunitiesFromSaved(s: SavedContract): UploadedOpportunity[] {
  const d = s.data;
  if (!d.auto_renewal.value) return [];
  const fee = d.annual_fee.value;
  const base = {
    contractId: s.id,
    vendor: d.vendor,
    initials: initialsFor(d.vendor),
    hue: hueFor(d.vendor),
    actBy: s.noticeDeadline ?? "",
  };
  const out: UploadedOpportunity[] = [];

  if (d.uplift_cap_percent.value == null) {
    out.push({
      ...base,
      id: `up-${s.id}-cap`,
      lever: "price",
      goal: "cap",
      finding: "Auto-renews with no cap on price increases",
      annualSavings: fee ? Math.round((fee * (ASSUMED_UPLIFT_PCT - TARGET_CAP_PCT)) / 100) : 0,
      estimate: true,
      action: "Ask for a cap",
      basis: fee
        ? `A typical ${ASSUMED_UPLIFT_PCT}% renewal increase held to a ${TARGET_CAP_PCT}% cap, on the ${fee.toLocaleString("en-US")} annual fee`
        : "Needs the annual fee, usually in the order form",
    });
  }

  const pct = d.seat_reduction_percent.value;
  if (pct != null && pct > 0) {
    out.push({
      ...base,
      id: `up-${s.id}-seats`,
      lever: "seats",
      goal: "seats",
      finding: `Contract lets you cut up to ${pct}% of seats at renewal`,
      annualSavings: fee ? Math.round((fee * pct) / 100) : 0,
      estimate: true,
      action: "Right-size",
      basis: fee ? `${pct}% of the annual fee, if that many seats are unused` : "Needs the annual fee, usually in the order form",
    });
  }

  return out;
}
