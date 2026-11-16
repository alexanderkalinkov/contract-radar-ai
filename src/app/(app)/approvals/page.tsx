"use client";

import Link from "next/link";
import { useState } from "react";
import { recommendationLabel, reviewSummary, type ReviewStage } from "@/lib/approvals";
import { longDate, usd } from "@/lib/format";
import { QUEUE_DAYS, useRenewalQueue, type QueueRow } from "@/lib/useRenewalQueue";
import { StageBadge } from "@/components/RenewalDecision";
import { Card, cx, DaysBadge, H2, PageHeader, Segmented, VendorLogo } from "@/components/ui";

type Filter = "all" | ReviewStage;

const SECTIONS: { stage: ReviewStage; title: string; empty: string }[] = [
  { stage: "pending", title: "Waiting for approval", empty: "Nothing is waiting for approval." },
  { stage: "needs_recommendation", title: "Needs a recommendation", empty: `Every renewal in the next ${QUEUE_DAYS} days has a recommendation.` },
  { stage: "rejected", title: "Sent back", empty: "Nothing was sent back." },
  { stage: "approved", title: "Approved", empty: "Nothing approved yet." },
];

export default function ApprovalsPage() {
  const q = useRenewalQueue();
  const [filter, setFilter] = useState<Filter>("all");
  // Approvers see their queue first; department owners see what needs a recommendation first.
  const order = q.canApprove ? SECTIONS : [SECTIONS[1], SECTIONS[2], SECTIONS[0], SECTIONS[3]];
  const shown = order.filter((s) => filter === "all" || s.stage === filter);

  return (
    <>
      <PageHeader eyebrow={`Every renewal in the next ${QUEUE_DAYS} days: the owner recommends, an approver signs off, and each step is logged`} title="Renewal approvals" />

      {q.setupNeeded && <p className="m-0 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-text">{q.setupNeeded}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Waiting for approval" value={String(q.counts.pending)} strong={q.canApprove && q.counts.pending > 0} />
        <Stat label="Need a recommendation" value={String(q.counts.needs)} strong={!q.canApprove && q.counts.needs > 0} />
        <Stat label="Sent back" value={String(q.counts.rejected)} />
        <Stat label="Approved savings / yr" value={usd(q.approvedSavings)} good />
      </div>

      <Segmented<Filter>
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "pending", label: "Waiting" },
          { value: "needs_recommendation", label: "Needs recommendation" },
          { value: "rejected", label: "Sent back" },
          { value: "approved", label: "Approved" },
        ]}
      />

      {q.loading && <p className="m-0 text-sm text-muted">Loading…</p>}

      {!q.loading &&
        shown.map((s) => {
          const rows = q.rows.filter((r) => r.stage === s.stage);
          if (filter === "all" && !rows.length && s.stage !== "pending") return null;
          return (
            <Card key={s.stage} label={s.title} className="flex flex-col gap-3 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <H2>{s.title}</H2>
                <span className="text-[13px] text-muted">{rows.length}</span>
              </div>
              {rows.length === 0 ? <p className="m-0 text-sm text-muted">{s.empty}</p> : rows.map((r) => <Row key={r.contract.id} r={r} />)}
            </Card>
          );
        })}
    </>
  );
}

function Stat({ label, value, strong, good }: { label: string; value: string; strong?: boolean; good?: boolean }) {
  return (
    <div className={cx("flex flex-col gap-1 rounded-[14px] border px-4 py-3.5", strong ? "border-brand-line bg-brand-soft" : "border-line bg-white")}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cx("font-display text-2xl font-semibold", good && "text-good")}>{value}</span>
    </div>
  );
}

function Row({ r }: { r: QueueRow }) {
  const c = r.contract;
  const rv = r.review;
  return (
    <Link href={`/contracts/${c.id}#renewal-decision`} className="flex flex-wrap items-center gap-3.5 rounded-xl border border-line-soft px-4 py-3 text-ink hover:bg-[#F8FAFC]">
      <VendorLogo initials={c.initials} hue={c.hue} />
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
        <span className="font-semibold">
          {c.vendor} {c.product}
        </span>
        <span className="truncate text-[13px] text-muted">
          {rv
            ? `${reviewSummary(rv)} · by ${rv.recommendedByEmail ?? "someone"}${rv.decidedByEmail ? ` · ${rv.status === "approved" ? "approved" : "sent back"} by ${rv.decidedByEmail}` : ""}`
            : `Owner: ${c.owner}`}
        </span>
        {rv?.status === "rejected" && rv.decisionNote && <span className="text-[13px] text-[#912018]">“{rv.decisionNote}”</span>}
      </div>
      <div className="flex flex-col items-end gap-1">
        <StageBadge stage={r.stage} />
        {r.decideBy ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            Decide by {longDate(r.decideBy)} {r.days != null && r.days >= 0 && <DaysBadge days={r.days} />}
          </span>
        ) : (
          <span className="text-xs text-muted">No date found</span>
        )}
      </div>
      <span className="sr-only">{rv ? recommendationLabel(rv.recommendation) : ""}</span>
    </Link>
  );
}
