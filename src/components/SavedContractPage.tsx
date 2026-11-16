"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { daysUntil, TODAY } from "@/lib/engine";
import { longDate, usd } from "@/lib/format";
import { documentKind } from "@/lib/extraction";
import { useContractUsage, usePortfolio, useSavedContracts } from "@/lib/portfolio";
import { hueFor, initialsFor, isRisky } from "@/lib/saved";
import { opportunitiesFromSaved } from "@/lib/opportunities";
import { SeatUsageCard } from "./SeatUsage";
import { ContractBooking } from "./enterprise/ContractBooking";
import { RenewalDecisionCard } from "./RenewalDecision";
import { cycleFor, goalFor } from "@/lib/approvals";
import { useApprovals } from "@/lib/useApprovals";
import { EmailDrafter } from "./EmailDrafter";
import { PriceChangePanel } from "./PriceHikes";
import { ExtractionCard } from "./Uploader";
import { btnGhost, Card, cx, VendorLogo } from "./ui";
import { useWorkspace } from "./WorkspaceProvider";
import { canWrite } from "@/lib/roles";

export function SavedContractPage({ id }: { id: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const { saved, loading, remove, link, review: reviewTerms } = useSavedContracts();
  const { history, contracts } = usePortfolio();
  const [busy, setBusy] = useState<"pdf" | "delete" | "link" | null>(null);
  const usageOf = useContractUsage();
  const [err, setErr] = useState<string | null>(null);
  const approvals = useApprovals();
  const s = saved.find((x) => x.id === id);

  if (loading) return <p className="text-sm text-muted">Loading contract…</p>;
  if (!s) {
    return (
      <Card className="flex flex-col items-start gap-3 p-8">
        <h1 className="m-0 font-display text-2xl font-semibold">Contract not found</h1>
        <p className="m-0 text-sm text-muted">
          It may have been deleted, or it was uploaded {ws.mode === "demo" ? "in another browser" : "in another workspace"}.
        </p>
        <Link href="/contracts" className="text-sm font-semibold text-brand">Back to contracts</Link>
      </Card>
    );
  }

  const d = s.data;
  const days = s.noticeDeadline ? daysUntil(s.noticeDeadline, TODAY) : null;
  const flags = isRisky(s);
  const change = history.changes.get(s.id) ?? null;
  const usage = usageOf(s);
  const found = opportunitiesFromSaved(s, change, usage);
  const seatOpp = found.find((o) => o.lever === "seats");
  const shownOnId = history.shownOn.get(s.id);
  const shownOn = shownOnId ? saved.find((x) => x.id === shownOnId) : undefined;
  const asContract = contracts.find((c) => c.id === s.id);
  const KIND: Record<string, string> = {
    contract: "Contract",
    order_form: "Order form",
    renewal_quote: "Renewal quote",
    amendment: "Amendment",
    invoice: "Invoice",
    other: "Document",
  };
  const timeline = (history.timeline.get(s.id) ?? []).map((x) => ({
    id: x.id,
    doc: x.data.agreement_name,
    fee: x.data.annual_fee.value,
    date: x.data.term_start ?? x.extractedAt.slice(0, 10),
    kind: KIND[documentKind(x.data)] ?? "Document",
    current: x.id === s.id,
  }));
  const review = asContract ? approvals.reviewFor(s.id, cycleFor(asContract)) : undefined;
  const approvedGoal = review?.status === "approved" ? goalFor(review.recommendation, Boolean(change && change.deltaAbs > 0)) : null;
  const others = saved.filter((x) => x.id !== s.id);
  const matchValue = s.supersedesId == null ? "auto" : s.supersedesId === s.id ? "none" : s.supersedesId;

  async function setMatch(value: string) {
    setBusy("link");
    setErr(null);
    try {
      await link(id, value === "auto" ? null : value === "none" ? id : value);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function openPdf(page?: number) {
    setBusy("pdf");
    setErr(null);
    // Open the tab now, while the click still counts as a user action, so pop-up blockers allow it.
    const tab = page != null ? window.open("about:blank", "_blank") : null;
    try {
      const res = await fetch(`/api/contracts/${id}`);
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "The original PDF is not available.");
      // Browser PDF viewers jump to the page in the #page fragment.
      const url = page != null ? `${json.url}#page=${page}` : json.url;
      if (tab) tab.location.href = url;
      else window.open(url, "_blank", "noopener");
    } catch (e) {
      tab?.close();
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function del() {
    if (!window.confirm(`Delete ${d.vendor} (${s!.fileName}) from ${ws.workspaceName}? This can't be undone.`)) return;
    setBusy("delete");
    try {
      await remove(id);
      router.push("/contracts");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <Link href="/contracts" className="font-medium text-brand">Contracts</Link>
        <span aria-hidden="true">/</span>
        <span>{d.vendor}</span>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <VendorLogo initials={initialsFor(d.vendor)} hue={hueFor(d.vendor)} size={56} />
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 font-display text-[28px] font-semibold tracking-tight">{d.vendor}</h1>
            <div className="flex flex-wrap gap-2 text-[13px]">
              <span className="rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-brand-dark">Uploaded {longDate(s.extractedAt.slice(0, 10))}</span>
              {s.uploadedByEmail && <span className="rounded-full bg-chip px-2.5 py-1 font-semibold text-ink-2">By {s.uploadedByEmail}</span>}
              <span className="rounded-full bg-chip px-2.5 py-1 font-semibold text-ink-2">{s.fileName}</span>
            </div>
          </div>
        </div>
        <div className={cx("flex flex-col items-end gap-0.5 rounded-xl border border-line px-[18px] py-3", days != null && days <= 30 ? "bg-warn-soft" : "bg-white")}>
          <span className="text-xs font-semibold tracking-wide text-muted">NOTICE DEADLINE</span>
          <span className={cx("font-display text-[22px] font-semibold", days != null && days <= 30 ? "text-warn" : "text-ink")}>
            {s.noticeDeadline ? `${longDate(s.noticeDeadline)} · ${days! >= 0 ? `${days} days` : "passed"}` : "Not found"}
          </span>
        </div>
      </header>

      {shownOn && (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-brand-line bg-brand-soft px-[18px] py-3 text-sm text-brand-dark">
          {documentKind(d) === "renewal_quote" ? "This renewal quote is compared with" : "A newer document replaces this one:"}{" "}
          <Link href={`/contracts/${shownOn.id}`} className="font-semibold text-brand">
            {shownOn.data.agreement_name}
          </Link>
          . Price changes, reminders and the pushback email live there.
        </div>
      )}

      {flags.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-warn-line bg-warn-soft px-[18px] py-3.5 text-sm text-[#7A2E0B]">
          <strong>Worth acting on</strong>
          <ul className="m-0 list-disc pl-5">
            {flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        {s.hasFile && (
          <button type="button" className={btnGhost} onClick={() => openPdf()} disabled={busy !== null}>
            {busy === "pdf" ? "Opening…" : "Open original file"}
          </button>
        )}
        {(ws.mode === "demo" || canWrite(ws.role)) && (
          <button type="button" className={cx(btnGhost, "text-[#912018]")} onClick={del} disabled={busy !== null}>
            {busy === "delete" ? "Deleting…" : "Delete contract"}
          </button>
        )}
      </div>
      {err && <p role="alert" className="m-0 text-sm text-[#912018]">{err}</p>}

      {found.length > 0 && (
        <Card label="Savings found" className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 font-display text-[19px] font-semibold">Savings found</h2>
            <span className="text-[13px] text-muted">
              {usage
                ? `From this contract, the documents compared with it and ${usage.source} sign-ins. "Up to" amounts need the vendor to agree.`
                : `From this contract and the documents compared with it. "Up to" amounts are estimates; connecting Google Workspace or Microsoft sign-ins will firm up seat savings.`}
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
            {found.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{o.finding}</span>
                  <span className="text-[13px] text-muted">{o.basis}</span>
                </div>
                <span className={cx("font-display text-lg font-semibold whitespace-nowrap", o.annualSavings > 0 ? "text-good" : "text-muted")}>
                  {o.annualSavings > 0 ? `${o.estimate ? "up to " : ""}${usd(o.annualSavings)}/yr` : "Not sized yet"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ContractBooking contractId={s.id} />
      {usage && <SeatUsageCard u={usage} />}

      <PriceChangePanel change={change} escalators={asContract?.escalators ?? []} timeline={timeline} />

      {others.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Compare prices with
          <select
            value={matchValue}
            onChange={(e) => setMatch(e.target.value)}
            disabled={busy !== null}
            className="min-h-9 max-w-full rounded-lg border border-[#D0D5DD] bg-white px-2 text-[13px] text-ink"
          >
            <option value="auto">Matched automatically</option>
            <option value="none">Nothing (a separate contract)</option>
            {others.map((x) => (
              <option key={x.id} value={x.id}>
                {x.data.vendor} · {x.data.agreement_name}
              </option>
            ))}
          </select>
          {busy === "link" && <span>Saving…</span>}
        </label>
      )}

      {asContract && !shownOn && <RenewalDecisionCard contract={asContract} opportunities={found} />}

      <div id="pushback-email" className="scroll-mt-6">
      <EmailDrafter
        key={approvedGoal ?? "suggested"}
        contract={s}
        priceChange={change}
        defaultGoal={approvedGoal ?? [...found].sort((a, b) => b.annualSavings - a.annualSavings)[0]?.goal ?? (change && change.deltaAbs > 0 ? "hike" : "review")}
        seats={
          usage
            ? {
                paid: usage.paid,
                active: usage.active,
                target: (review?.status === "approved" && review.recommendation === "cut_seats" ? review.targetSeats : null) ?? seatOpp?.targetSeats ?? null,
                source: usage.source,
                days: usage.activeDays ?? 30,
              }
            : undefined
        }
      />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="m-0 font-display text-[19px] font-semibold">Extracted terms</h2>
        <span className="text-[13px] text-muted">
          {d.agreement_name} · every value shows the passage and page it came from{s.hasFile ? "; click a page number to open the original there" : ""}
        </span>
      </div>
      <ExtractionCard r={s} hideHeader onReview={ws.mode === "demo" || canWrite(ws.role) ? (a) => reviewTerms(id, a) : undefined} onOpenPage={s.hasFile ? (p) => openPdf(p) : undefined} />
    </>
  );
}
