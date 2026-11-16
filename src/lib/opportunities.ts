// Savings opportunities found in a contract the team uploaded, using only what the contract itself says.
// With sign-in data from Google Workspace or Microsoft, the seat finding uses real unused seats; without it,
// amounts are "up to" estimates and the assumptions are spelled out where they're shown.
import type { SavedContract } from "./saved";
import { hueFor, initialsFor } from "./saved";
import type { Opportunity, SeatUsage } from "./types";
import { activeLabel, unusedSeats, worthCutting } from "./usage";

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
  /** For seat cuts backed by sign-ins: the seat count to ask for at renewal. */
  targetSeats?: number;
}

/** Seats you can drop at renewal: the unused ones, limited by the contract's seat-reduction clause when it has one. */
export function removableSeats(u: SeatUsage, seatReductionPct: number | null): number {
  const unused = unusedSeats(u);
  return seatReductionPct != null ? Math.min(unused, Math.floor((u.paid * seatReductionPct) / 100)) : unused;
}

export function opportunitiesFromSaved(s: SavedContract, usage?: SeatUsage): UploadedOpportunity[] {
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
  if (usage && worthCutting(usage) && (pct == null || pct > 0)) {
    const unused = unusedSeats(usage);
    const cut = removableSeats(usage, pct);
    const perSeat = fee ? fee / usage.paid : 0;
    const limit = pct != null && cut < unused ? `; the contract allows cutting ${pct}% (${cut} seats)` : "";
    out.push({
      ...base,
      id: `up-${s.id}-seats`,
      lever: "seats",
      goal: "seats",
      finding: `${unused} of ${usage.paid} seats had no sign-in in ${activeLabel(usage)}`,
      annualSavings: Math.round(perSeat * cut),
      // Without a seat-reduction clause the vendor has to agree to the cut.
      estimate: pct == null,
      action: "Right-size",
      targetSeats: usage.paid - cut,
      basis: `${usage.source} sign-ins: ${usage.active} of ${usage.paid} paid seats used in the last ${activeLabel(usage)}${limit}${
        pct == null ? ". No seat-reduction clause found, so ask the vendor at renewal" : ""
      }${fee ? `, at $${Math.round(perSeat).toLocaleString("en-US")} a seat` : ""}`,
    });
  } else if (!usage && pct != null && pct > 0) {
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
