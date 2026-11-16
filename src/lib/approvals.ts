// Renewal approvals: before each renewal, the department owner recommends what to do (keep, cut seats, consolidate,
// renegotiate or cancel) and why; an approver (an admin, or a Finance approver once roles land) approves it or sends
// it back. Every step is kept as an event, so there is a record of who decided what and when.
//
// Shared by the browser and the server. The database side is supabase/migrations/20261116220000_renewal_approvals.sql.
import { noticeDeadline } from "./engine";
import type { EmailGoal } from "./opportunities";
import type { Contract, Opportunity } from "./types";

export type Recommendation = "keep" | "cut_seats" | "consolidate" | "renegotiate" | "cancel";
export type ReviewStatus = "pending" | "approved" | "rejected";
/** Where a renewal is in the workflow. "needs_recommendation" = nobody has recommended anything yet. */
export type ReviewStage = "needs_recommendation" | ReviewStatus;
export type ReviewAction = "recommended" | "revised" | "approved" | "rejected" | "reopened";

export const RECOMMENDATIONS: { value: Recommendation; label: string; hint: string }[] = [
  { value: "keep", label: "Keep as is", hint: "Renew on the current terms." },
  { value: "cut_seats", label: "Cut seats", hint: "Renew with fewer seats." },
  { value: "consolidate", label: "Consolidate", hint: "Move users to another tool and retire this one." },
  { value: "renegotiate", label: "Renegotiate", hint: "Renew, but push back on price or terms first." },
  { value: "cancel", label: "Cancel", hint: "Give notice and don't renew." },
];

export const recommendationLabel = (r: Recommendation) => RECOMMENDATIONS.find((x) => x.value === r)?.label ?? r;

export const STAGE_LABEL: Record<ReviewStage, string> = {
  needs_recommendation: "Needs a recommendation",
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Sent back",
};

export interface ReviewEvent {
  id: string;
  action: ReviewAction;
  actorEmail: string | null;
  at: string; // ISO timestamp
  recommendation: Recommendation | null;
  expectedSavings: number | null;
  note: string | null;
}

export interface RenewalReview {
  id: string;
  contractId: string;
  /** The renewal this decision is for: the current term's end date (YYYY-MM-DD), or "open" when it isn't known. */
  cycle: string;
  vendor: string;
  recommendation: Recommendation;
  reason: string;
  targetSeats: number | null;
  /** For "consolidate": the tool people move to. */
  consolidateInto: string | null;
  /** Annual savings if the plan works, in the contract's currency. */
  expectedSavings: number | null;
  status: ReviewStatus;
  recommendedByEmail: string | null;
  recommendedAt: string;
  decidedByEmail: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  events: ReviewEvent[];
  /** Kept in this browser (demo mode and the sample contracts), not in the database. */
  local?: boolean;
}

export interface RecommendationInput {
  contractId: string;
  cycle: string;
  vendor: string;
  recommendation: Recommendation;
  reason: string;
  targetSeats?: number | null;
  consolidateInto?: string | null;
  expectedSavings?: number | null;
}

export type ApprovalOp =
  | ({ op: "recommend" } & RecommendationInput)
  | { op: "decide"; reviewId: string; decision: "approved" | "rejected"; note?: string | null }
  | { op: "reopen"; reviewId: string; note?: string | null };

// Who can approve (admins and Finance approvers) lives with the roles, next to public.can_approve_renewals().
export { canApproveRenewals } from "./roles";
import { canWrite, type Role } from "./roles";

/** Read-only viewers can see decisions but not make them. */
export const canRecommendRenewals = (role: Role | undefined) => canWrite(role);

/** The renewal a contract's decision belongs to. A new term gets a new decision. */
export function cycleFor(c: Pick<Contract, "termEnd">): string {
  return c.termEnd || "open";
}

export function stageOf(r: RenewalReview | undefined | null): ReviewStage {
  return r ? r.status : "needs_recommendation";
}

/** Which pushback email fits an approved plan. */
export function goalFor(r: Recommendation, hasHike: boolean): EmailGoal {
  if (r === "cut_seats") return "seats";
  if (r === "cancel") return "cancel";
  if (r === "renegotiate") return hasHike ? "hike" : "cap";
  return "review";
}

/** A starting point for the form, from what Contract Radar already found on the contract. */
export function suggestRecommendation(
  c: Contract,
  opps: (Opportunity & { targetSeats?: number; basis?: string })[],
): { recommendation: Recommendation; reason: string; expectedSavings: number | null; targetSeats: number | null; consolidateInto: string | null } {
  const sum = (list: Opportunity[]) => list.reduce((s, o) => s + o.annualSavings, 0) || null;
  if (c.consolidation) {
    return {
      recommendation: "consolidate",
      reason: `Move ${c.consolidation.movedUsers} people to ${c.consolidation.keepVendor} and retire ${c.vendor}.`,
      expectedSavings: Math.max(0, c.annualFee - c.consolidation.extraCost) || null,
      targetSeats: null,
      consolidateInto: c.consolidation.keepVendor,
    };
  }
  const dup = opps.filter((o) => o.lever === "dup");
  if (dup.length) return { recommendation: "consolidate", reason: dup[0].finding + ".", expectedSavings: sum(dup), targetSeats: null, consolidateInto: null };
  const seats = opps.filter((o) => o.lever === "seats" && o.annualSavings > 0);
  const price = opps.filter((o) => o.lever === "price" || o.lever === "terms");
  if (seats.length && price.length) {
    return {
      recommendation: "renegotiate",
      reason: [...price, ...seats].map((o) => o.finding).join(". ") + ".",
      expectedSavings: sum([...price, ...seats]),
      targetSeats: seats[0].targetSeats ?? (c.usage ? c.usage.active : null),
      consolidateInto: null,
    };
  }
  if (seats.length) {
    return {
      recommendation: "cut_seats",
      reason: seats.map((o) => o.finding).join(". ") + ".",
      expectedSavings: sum(seats),
      targetSeats: seats[0].targetSeats ?? (c.usage ? c.usage.active : null),
      consolidateInto: null,
    };
  }
  if (price.length) return { recommendation: "renegotiate", reason: price.map((o) => o.finding).join(". ") + ".", expectedSavings: sum(price), targetSeats: null, consolidateInto: null };
  return { recommendation: "keep", reason: "", expectedSavings: null, targetSeats: null, consolidateInto: null };
}

/** The date a decision is needed by: the notice deadline, or the term end when there is no notice period. */
export function decideBy(c: Contract): string {
  return noticeDeadline(c) || c.termEnd || "";
}

/** Short one-line summary, e.g. "Cut seats to 160 · saves $56,977/yr". */
export function reviewSummary(r: Pick<RenewalReview, "recommendation" | "targetSeats" | "consolidateInto" | "expectedSavings">): string {
  const parts = [recommendationLabel(r.recommendation)];
  if (r.recommendation === "cut_seats" && r.targetSeats != null) parts[0] += ` to ${r.targetSeats}`;
  if (r.recommendation === "consolidate" && r.consolidateInto) parts[0] += ` into ${r.consolidateInto}`;
  if (r.expectedSavings) parts.push(`saves $${Math.round(r.expectedSavings).toLocaleString("en-US")}/yr`);
  return parts.join(" · ");
}
