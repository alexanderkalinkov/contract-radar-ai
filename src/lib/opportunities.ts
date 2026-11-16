// Savings opportunities found in a contract the team uploaded, using only what the contract itself says.
// Sample opportunities (seed.ts) also use seat logins and quotes; uploaded contracts don't have those yet,
// so these amounts are "up to" estimates and the assumptions are spelled out where they're shown.
import type { SavedContract } from "./saved";
import { hueFor, initialsFor } from "./saved";
import type { Opportunity, PriceChange } from "./types";

/** A typical list-price increase at renewal when nothing in the contract limits it. */
export const ASSUMED_UPLIFT_PCT = 7;
/** The cap we suggest asking for. */
export const TARGET_CAP_PCT = 3;

export type EmailGoal = "hike" | "cap" | "seats" | "cancel" | "review";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** The savings finding for a renewal price that went up, or null when there is nothing to push back on. */
export function hikeOpportunity(s: SavedContract, p: PriceChange): UploadedOpportunity | null {
  if (p.deltaAbs <= 0) return null;
  const base = {
    id: `up-${s.id}-hike`,
    contractId: s.id,
    vendor: s.data.vendor,
    initials: initialsFor(s.data.vendor),
    hue: hueFor(s.data.vendor),
    lever: "price" as const,
    goal: "hike" as const,
    actBy: p.actBy,
  };
  const up = `${p.deltaPct}% (${money(p.deltaAbs)})`;
  if (p.capPct != null) {
    if (p.overCap <= 0) return null;
    return {
      ...base,
      finding:
        p.source === "quote"
          ? `Renewal quote is up ${up}, over your ${p.capPct}% cap`
          : `Signed renewal went up ${up}, over your ${p.capPct}% cap`,
      annualSavings: p.overCap,
      action: p.source === "quote" ? "Push back" : "Ask for a credit",
      basis: `${money(p.previousFee)} → ${money(p.newFee)}. The ${p.capPct}% cap in ${p.previousDoc} allows ${money(p.cappedFee!)}.`,
    };
  }
  if (p.source !== "quote") return null; // already signed with no cap: the "ask for a cap" finding covers the next renewal
  const held = Math.round(p.newFee - p.previousFee * (1 + TARGET_CAP_PCT / 100));
  if (held <= 0) return null;
  return {
    ...base,
    finding: `Renewal quote is up ${up} and the contract has no cap`,
    annualSavings: held,
    estimate: true,
    action: "Push back",
    basis: `${money(p.previousFee)} → ${money(p.newFee)}. Amount if you hold the increase to ${TARGET_CAP_PCT}%.`,
  };
}

export interface UploadedOpportunity extends Opportunity {
  /** Which pushback email fits this opportunity. */
  goal: EmailGoal;
  /** Plain-English basis for the amount, shown next to it. */
  basis: string;
}

export function opportunitiesFromSaved(s: SavedContract, change?: PriceChange | null): UploadedOpportunity[] {
  const d = s.data;
  const hike = change ? hikeOpportunity(s, change) : null;
  if (!d.auto_renewal.value) return hike ? [hike] : [];
  const fee = d.annual_fee.value;
  const base = {
    contractId: s.id,
    vendor: d.vendor,
    initials: initialsFor(d.vendor),
    hue: hueFor(d.vendor),
    actBy: s.noticeDeadline ?? "",
  };
  const out: UploadedOpportunity[] = hike ? [hike] : [];

  // A real quote replaces the "typical increase" estimate.
  if (d.uplift_cap_percent.value == null && !(hike && change?.source === "quote")) {
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
