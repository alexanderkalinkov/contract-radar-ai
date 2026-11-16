"use client";

// Every renewal that needs (or has) a decision: contracts whose notice deadline or term end is within
// QUEUE_DAYS, plus any contract that already has a recommendation for its current term.
import { useMemo } from "react";
import { cycleFor, decideBy, stageOf, type RenewalReview, type ReviewStage } from "./approvals";
import { daysUntil } from "./engine";
import { usePortfolio } from "./portfolio";
import { useApprovals } from "./useApprovals";
import type { Contract } from "./types";

export const QUEUE_DAYS = 120;

export interface QueueRow {
  contract: Contract;
  decideBy: string;
  days: number | null;
  review: RenewalReview | undefined;
  stage: ReviewStage;
}

export function useRenewalQueue() {
  const { contracts, loading } = usePortfolio();
  const a = useApprovals();
  const rows = useMemo<QueueRow[]>(() => {
    const out: QueueRow[] = [];
    for (const c of contracts) {
      const review = a.reviewFor(c.id, cycleFor(c));
      const by = decideBy(c);
      const days = by ? daysUntil(by) : null;
      const upcoming = days != null && days >= 0 && days <= QUEUE_DAYS;
      if (!review && !upcoming) continue;
      out.push({ contract: c, decideBy: by, days, review, stage: stageOf(review) });
    }
    return out.sort((x, y) => (x.decideBy || "9999").localeCompare(y.decideBy || "9999"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, a.reviews]);
  const count = (s: ReviewStage) => rows.filter((r) => r.stage === s).length;
  const approvedSavings = rows.filter((r) => r.stage === "approved").reduce((s, r) => s + (r.review?.expectedSavings ?? 0), 0);
  return {
    rows,
    loading: loading || a.loading,
    canApprove: a.canApprove,
    setupNeeded: a.setupNeeded,
    counts: { needs: count("needs_recommendation"), pending: count("pending"), approved: count("approved"), rejected: count("rejected") },
    approvedSavings,
    /** What the badge in the menu counts: approvals waiting for an approver, recommendations needed for everyone else. */
    actionable: a.canApprove ? count("pending") : count("needs_recommendation") + count("rejected"),
  };
}
