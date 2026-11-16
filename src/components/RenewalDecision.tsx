"use client";

import Link from "next/link";
import { useState } from "react";
import {
  cycleFor,
  decideBy,
  RECOMMENDATIONS,
  recommendationLabel,
  reviewSummary,
  stageOf,
  STAGE_LABEL,
  suggestRecommendation,
  type Recommendation,
  type RenewalReview,
  type ReviewStage,
} from "@/lib/approvals";
import { daysUntil } from "@/lib/engine";
import { longDate } from "@/lib/format";
import { useTeam } from "@/lib/team/useTeam";
import { useApprovals } from "@/lib/useApprovals";
import type { Contract, Opportunity } from "@/lib/types";
import { btnGhost, btnPrimary, Card, cx, H2 } from "./ui";

const STAGE_CLASS: Record<ReviewStage, string> = {
  needs_recommendation: "bg-warn-soft text-warn-text",
  pending: "bg-brand-soft text-brand-dark",
  approved: "bg-good-soft text-good-dark",
  rejected: "bg-[#FEF3F2] text-[#912018]",
};

export function StageBadge({ stage }: { stage: ReviewStage }) {
  return <span className={cx("inline-block w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", STAGE_CLASS[stage])}>{STAGE_LABEL[stage]}</span>;
}

const ACTION_LABEL: Record<string, string> = {
  recommended: "recommended",
  revised: "revised the recommendation",
  approved: "approved",
  rejected: "sent it back",
  reopened: "reopened the decision",
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The renewal decision for one contract: the department owner's recommendation, the approver's decision, and the log.
 */
export function RenewalDecisionCard({
  contract: c,
  opportunities,
}: {
  contract: Contract;
  opportunities: (Opportunity & { targetSeats?: number; basis?: string })[];
}) {
  const a = useApprovals();
  const team = useTeam();
  const cycle = cycleFor(c);
  const review = a.reviewFor(c.id, cycle);
  const stage = stageOf(review);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const by = decideBy(c);
  const days = by ? daysUntil(by) : null;

  // Department owners recommend for their own department's tools; admins and approvers for any.
  const tool = team.raw?.tools.find((t) => t.contract_id === c.id);
  const deptName = tool?.department_id ? team.data?.departments.find((d) => d.id === tool.department_id)?.name : undefined;
  const ownDept = !tool?.department_id || a.canApprove || team.me?.department_id === tool.department_id;
  const mayRecommend = a.isLocal(c.id) || (a.canRecommend && ownDept);

  const showForm = mayRecommend && (stage === "needs_recommendation" || editing);

  return (
    <Card label="Renewal decision" className="flex flex-col gap-4 p-5">
      <div id="renewal-decision" className="flex flex-wrap items-start justify-between gap-3 scroll-mt-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <H2>Renewal decision</H2>
            <StageBadge stage={stage} />
          </div>
          <span className="text-[13px] text-muted">
            {deptName ? `The ${deptName} owner` : "The department owner"} recommends what to do, an approver signs it off, and every step is logged.
            {by && ` Decide by ${longDate(by)}${days != null ? (days >= 0 ? ` (${days} days)` : " (passed)") : ""}.`}
          </span>
        </div>
      </div>

      {a.setupNeeded && !a.isLocal(c.id) && (
        <p className="m-0 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn-text">{a.setupNeeded}</p>
      )}

      {review && !editing && <ReviewSummary review={review} />}

      {showForm && !a.setupNeeded && (
        <RecommendForm
          key={review?.id ?? "new"}
          contract={c}
          cycle={cycle}
          review={review}
          opportunities={opportunities}
          onDone={(text) => {
            setEditing(false);
            setNotice(text);
          }}
          onCancel={review ? () => setEditing(false) : undefined}
        />
      )}

      {!showForm && stage === "needs_recommendation" && (
        <p className="m-0 text-sm text-muted">
          {a.canRecommend
            ? `Waiting for ${deptName ? `the ${deptName} department owner` : "the department owner"} to recommend keep, cut seats, consolidate, renegotiate or cancel.`
            : "Nobody has recommended anything for this renewal yet."}
        </p>
      )}

      {notice && !editing && <p role="status" className="m-0 text-sm text-good">{notice}</p>}

      {review && !editing && <DecisionControls review={review} mayRecommend={mayRecommend} onEdit={() => setEditing(true)} />}

      {review && review.events.length > 0 && (
        <details className="group text-[13px]">
          <summary className="cursor-pointer font-semibold text-brand">History ({review.events.length})</summary>
          <ol className="m-0 mt-2 flex list-none flex-col gap-2 border-l-2 border-line-soft p-0 pl-3">
            {[...review.events].reverse().map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5">
                <span>
                  <strong>{e.actorEmail ?? "Someone"}</strong> {ACTION_LABEL[e.action] ?? e.action}
                  {(e.action === "recommended" || e.action === "revised") && e.recommendation ? `: ${recommendationLabel(e.recommendation)}` : ""}
                </span>
                {e.note && <span className="text-muted">“{e.note}”</span>}
                <span className="text-xs text-muted">{fmtTime(e.at)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {a.isLocal(c.id) && (
        <p className="m-0 text-xs text-muted">
          {c.uploaded ? "Demo mode: decisions are kept in this browser." : "Sample contract: decisions are kept in this browser, so you can try the flow."}
        </p>
      )}
    </Card>
  );
}

function ReviewSummary({ review: r }: { review: RenewalReview }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-soft bg-[#F8FAFC] px-4 py-3">
      <span className="font-display text-[17px] font-semibold">{reviewSummary(r)}</span>
      <span className="text-sm whitespace-pre-line text-ink-2">{r.reason}</span>
      <span className="text-xs text-muted">
        Recommended by {r.recommendedByEmail ?? "someone"} on {fmtTime(r.recommendedAt)}
      </span>
      {r.decidedAt && (
        <div
          className={cx(
            "mt-1 flex flex-col gap-0.5 rounded-lg px-3 py-2 text-sm",
            r.status === "approved" ? "bg-good-soft text-good-dark" : "bg-[#FEF3F2] text-[#912018]",
          )}
        >
          <strong>
            {r.status === "approved" ? "Approved" : "Sent back"} by {r.decidedByEmail ?? "an approver"} on {fmtTime(r.decidedAt)}
          </strong>
          {r.decisionNote && <span>“{r.decisionNote}”</span>}
        </div>
      )}
    </div>
  );
}

function DecisionControls({ review: r, mayRecommend, onEdit }: { review: RenewalReview; mayRecommend: boolean; onEdit: () => void }) {
  const a = useApprovals();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const approver = a.isLocal(r.contractId) || a.canApprove;

  async function act(kind: "approved" | "rejected" | "reopen") {
    setBusy(kind);
    setMsg(null);
    const res = kind === "reopen" ? await a.reopen(r.id, note) : await a.decide(r.id, kind, note);
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Something went wrong." });
    setNote("");
    if (res.emailed?.length) setMsg({ ok: true, text: `Emailed ${res.emailed.join(", ")}.` });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {r.status === "pending" && approver && (
        <>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-2">
            Note for {r.recommendedByEmail ?? "the department owner"} <span className="font-normal text-muted">(needed to send it back)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              className="rounded-[10px] border border-[#D0D5DD] p-2.5 text-sm font-normal text-ink"
            />
          </label>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => act("approved")}>
              {busy === "approved" ? "Approving…" : "Approve"}
            </button>
            <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("rejected")}>
              {busy === "rejected" ? "Sending back…" : "Send back"}
            </button>
            {mayRecommend && (
              <button type="button" className={btnGhost} disabled={busy !== null} onClick={onEdit}>
                Edit recommendation
              </button>
            )}
          </div>
        </>
      )}
      {r.status === "pending" && !approver && (
        <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted">
          Waiting for an approver.
          {mayRecommend && (
            <button type="button" className={btnGhost} onClick={onEdit}>
              Edit recommendation
            </button>
          )}
        </div>
      )}
      {r.status === "rejected" && mayRecommend && (
        <div>
          <button type="button" className={btnPrimary} onClick={onEdit}>
            Update and resubmit
          </button>
        </div>
      )}
      {r.status === "approved" && (
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          {r.recommendation !== "keep" && (
            <a href="#pushback-email" className={btnPrimary}>
              Draft the email to {r.vendor || "the vendor"}
            </a>
          )}
          {approver && (
            <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("reopen")}>
              {busy === "reopen" ? "Reopening…" : "Reopen"}
            </button>
          )}
        </div>
      )}
      {r.status === "rejected" && approver && !mayRecommend && (
        <div>
          <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("reopen")}>
            Reopen
          </button>
        </div>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={cx("m-0 text-sm", msg.ok ? "text-good" : "text-[#912018]")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function RecommendForm({
  contract: c,
  cycle,
  review,
  opportunities,
  onDone,
  onCancel,
}: {
  contract: Contract;
  cycle: string;
  review?: RenewalReview;
  opportunities: (Opportunity & { targetSeats?: number; basis?: string })[];
  onDone: (notice: string | null) => void;
  onCancel?: () => void;
}) {
  const a = useApprovals();
  const s = suggestRecommendation(c, opportunities);
  const [rec, setRec] = useState<Recommendation>(review?.recommendation ?? s.recommendation);
  const [reason, setReason] = useState(review?.reason ?? s.reason);
  const [seats, setSeats] = useState<string>(String(review?.targetSeats ?? s.targetSeats ?? ""));
  const [into, setInto] = useState(review?.consolidateInto ?? s.consolidateInto ?? "");
  const [savings, setSavings] = useState<string>(String(review?.expectedSavings ?? s.expectedSavings ?? (rec === "cancel" ? c.annualFee || "" : "")));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const usage = c.usage;
  const field = "min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm font-normal text-ink";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const n = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(/[^0-9.]/g, ""))));
    const res = await a.recommend({
      contractId: c.id,
      cycle,
      vendor: c.vendor,
      recommendation: rec,
      reason,
      targetSeats: rec === "cut_seats" ? n(seats) : null,
      consolidateInto: rec === "consolidate" ? into : null,
      expectedSavings: rec === "keep" ? null : n(savings),
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Something went wrong.");
    onDone(res.emailed?.length ? `Sent for approval. Emailed ${res.emailed.join(", ")}.` : null);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">Recommendation</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RECOMMENDATIONS.map((o) => (
            <label
              key={o.value}
              className={cx(
                "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-sm",
                rec === o.value ? "border-brand bg-brand-soft" : "border-line hover:bg-[#F8FAFC]",
              )}
            >
              <input
                type="radio"
                name="recommendation"
                value={o.value}
                checked={rec === o.value}
                onChange={() => {
                  setRec(o.value);
                  if (o.value === "cancel" && !savings && c.annualFee) setSavings(String(c.annualFee));
                }}
                className="mt-1"
              />
              <span className="flex flex-col">
                <span className="font-semibold">{o.label}</span>
                <span className="text-[13px] text-muted">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {(usage || s.reason) && (
        <div className="flex flex-col gap-0.5 rounded-lg bg-[#F8FAFC] px-3 py-2 text-[13px] text-muted">
          <strong className="text-ink-2">What Contract Radar found</strong>
          {usage && (
            <span>
              {usage.active} of {usage.paid} paid seats active ({usage.source}).
            </span>
          )}
          {opportunities.map((o) => (
            <span key={o.id}>
              {o.finding}
              {o.annualSavings > 0 ? `: ${o.estimate ? "up to " : ""}$${o.annualSavings.toLocaleString("en-US")}/yr` : ""}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {rec === "cut_seats" && (
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-2">
            Seats to keep
            <input inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} className={cx(field, "w-36")} placeholder={c.seats ? String(c.seats) : ""} />
          </label>
        )}
        {rec === "consolidate" && (
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-2">
            Move people to
            <input value={into} onChange={(e) => setInto(e.target.value)} maxLength={120} className={cx(field, "w-56")} placeholder="e.g. Microsoft Teams" />
          </label>
        )}
        {rec !== "keep" && (
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-2">
            Expected savings per year ($)
            <input inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} className={cx(field, "w-44")} />
          </label>
        )}
      </div>

      <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-2">
        Why
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={2000}
          required
          placeholder="What the team uses it for, what changes, and what happens if we cut it."
          className="rounded-[10px] border border-[#D0D5DD] p-2.5 text-sm font-normal text-ink"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2.5">
        <button type="submit" className={btnPrimary} disabled={busy || !reason.trim()}>
          {busy ? "Sending…" : review ? "Resubmit for approval" : "Send for approval"}
        </button>
        {onCancel && (
          <button type="button" className={btnGhost} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <Link href="/approvals" className="text-[13px] font-semibold text-brand">
          All renewal decisions
        </Link>
      </div>
      {err && (
        <p role="alert" className="m-0 text-sm text-[#912018]">
          {err}
        </p>
      )}
    </form>
  );
}
