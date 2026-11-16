"use client";

// Renewal approvals in the browser. Uploaded contracts in a signed-in workspace go to the database through
// /api/approvals. The sample contracts, and everything in demo mode, are kept in this browser so the flow can be
// shown without an account.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { canApproveRenewals, canRecommendRenewals, type ApprovalOp, type RecommendationInput, type RenewalReview, type ReviewEvent } from "./approvals";
import { isSampleId } from "./saved";
import { useStored } from "./store";

const LOCAL_KEY = "cr-renewal-reviews";

let cache: { reviews: RenewalReview[]; setupNeeded: string | null } | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(v: typeof cache) => void>();
function publish(v: NonNullable<typeof cache>) {
  cache = v;
  listeners.forEach((l) => l(v));
}

async function load() {
  const res = await fetch("/api/approvals", { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Could not load renewal approvals.");
  publish({ reviews: json.reviews as RenewalReview[], setupNeeded: (json.setupNeeded as string) ?? null });
}

export const reviewKey = (contractId: string, cycle: string) => `${contractId}|${cycle}`;

export function useApprovals() {
  const ws = useWorkspace();
  const cloudMode = ws.mode === "cloud";
  const [local, setLocal] = useStored<RenewalReview[]>(LOCAL_KEY, []);
  const [cloud, setCloud] = useState(cache);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!cloudMode) return;
    try {
      inflight ??= load().finally(() => (inflight = null));
      await inflight;
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [cloudMode]);

  useEffect(() => {
    if (!cloudMode) return;
    listeners.add(setCloud);
    if (cache == null) refresh();
    return () => {
      listeners.delete(setCloud);
    };
  }, [cloudMode, refresh]);

  const reviews = useMemo(() => [...(cloudMode ? cloud?.reviews ?? [] : []), ...local], [cloudMode, cloud, local]);
  const byKey = useMemo(() => new Map(reviews.map((r) => [reviewKey(r.contractId, r.cycle), r])), [reviews]);

  // Demo mode: you play every part. Signed in: the workspace role decides.
  const canApprove = !cloudMode || canApproveRenewals(ws.role);
  const canRecommend = !cloudMode || canRecommendRenewals(ws.role);
  const isLocal = (contractId: string) => !cloudMode || isSampleId(contractId);

  const run = useCallback(
    async (op: ApprovalOp): Promise<{ ok: boolean; error?: string; emailed?: string[] }> => {
      const contractId = op.op === "recommend" ? op.contractId : reviews.find((r) => r.id === op.reviewId)?.contractId;
      if (contractId && (!cloudMode || isSampleId(contractId))) {
        const next = applyLocal(local, op, ws.email ?? "you (demo)");
        if (typeof next === "string") return { ok: false, error: next };
        setLocal(next);
        return { ok: true };
      }
      try {
        const res = await fetch("/api/approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: json.error ?? "Something went wrong." };
        await load();
        return { ok: true, emailed: json.emailed };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    [cloudMode, reviews, local, setLocal, ws.email],
  );

  return {
    reviews,
    reviewFor: (contractId: string, cycle: string) => byKey.get(reviewKey(contractId, cycle)),
    loading: cloudMode && cloud == null && !error,
    error,
    setupNeeded: cloudMode ? cloud?.setupNeeded ?? null : null,
    canApprove,
    canRecommend,
    isLocal,
    recommend: (input: RecommendationInput) => run({ op: "recommend", ...input }),
    decide: (reviewId: string, decision: "approved" | "rejected", note?: string) => run({ op: "decide", reviewId, decision, note }),
    reopen: (reviewId: string, note?: string) => run({ op: "reopen", reviewId, note }),
    refresh,
  };
}

/** The same rules as the SQL functions, for reviews kept in this browser. Returns an error message or the new list. */
function applyLocal(list: RenewalReview[], op: ApprovalOp, actor: string): RenewalReview[] | string {
  const now = new Date().toISOString();
  const event = (r: RenewalReview, action: ReviewEvent["action"], note: string | null): ReviewEvent => ({
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action,
    actorEmail: actor,
    at: now,
    recommendation: r.recommendation,
    expectedSavings: r.expectedSavings,
    note,
  });
  if (op.op === "recommend") {
    if (!op.reason.trim()) return "Say why, so the approver can decide.";
    const existing = list.find((r) => r.contractId === op.contractId && r.cycle === op.cycle);
    if (existing?.status === "approved") return "This renewal is already approved; an approver has to reopen it first.";
    const base: RenewalReview = {
      id: existing?.id ?? `local-review-${op.contractId}-${op.cycle}`,
      contractId: op.contractId,
      cycle: op.cycle,
      vendor: op.vendor,
      recommendation: op.recommendation,
      reason: op.reason.trim(),
      targetSeats: op.recommendation === "cut_seats" ? op.targetSeats ?? null : null,
      consolidateInto: op.recommendation === "consolidate" ? op.consolidateInto?.trim() || null : null,
      expectedSavings: op.recommendation === "keep" ? null : op.expectedSavings ?? null,
      status: "pending",
      recommendedByEmail: actor,
      recommendedAt: now,
      decidedByEmail: null,
      decidedAt: null,
      decisionNote: null,
      events: existing?.events ?? [],
      local: true,
    };
    base.events = [...base.events, event(base, existing ? "revised" : "recommended", base.reason)];
    return [base, ...list.filter((r) => r.id !== base.id)];
  }
  const r = list.find((x) => x.id === op.reviewId);
  if (!r) return "Review not found.";
  if (op.op === "decide") {
    if (r.status !== "pending") return "This recommendation is not waiting for approval.";
    const note = op.note?.trim() || null;
    if (op.decision === "rejected" && !note) return "Say why when you send a recommendation back.";
    const next: RenewalReview = { ...r, status: op.decision, decidedByEmail: actor, decidedAt: now, decisionNote: note };
    next.events = [...r.events, event(next, op.decision, note)];
    return list.map((x) => (x.id === r.id ? next : x));
  }
  if (r.status === "pending") return "This recommendation is already waiting for approval.";
  const next: RenewalReview = { ...r, status: "pending", decidedByEmail: null, decidedAt: null, decisionNote: null };
  next.events = [...r.events, event(next, "reopened", op.note?.trim() || null)];
  return list.map((x) => (x.id === r.id ? next : x));
}
