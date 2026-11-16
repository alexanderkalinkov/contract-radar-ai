"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { daysUntil, TODAY } from "@/lib/engine";
import { longDate, usd } from "@/lib/format";
import { useSavedContracts } from "@/lib/portfolio";
import { hueFor, initialsFor, isRisky } from "@/lib/saved";
import { opportunitiesFromSaved } from "@/lib/opportunities";
import { EmailDrafter } from "./EmailDrafter";
import { ExtractionCard } from "./Uploader";
import { btnGhost, Card, cx, VendorLogo } from "./ui";
import { useWorkspace } from "./WorkspaceProvider";

export function SavedContractPage({ id }: { id: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const { saved, loading, remove } = useSavedContracts();
  const [busy, setBusy] = useState<"pdf" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
  const found = opportunitiesFromSaved(s);

  async function openPdf() {
    setBusy("pdf");
    setErr(null);
    try {
      const res = await fetch(`/api/contracts/${id}`);
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "The original PDF is not available.");
      window.open(json.url, "_blank", "noopener");
    } catch (e) {
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
          <button type="button" className={btnGhost} onClick={openPdf} disabled={busy !== null}>
            {busy === "pdf" ? "Opening…" : "Open original file"}
          </button>
        )}
        <button type="button" className={cx(btnGhost, "text-[#912018]")} onClick={del} disabled={busy !== null}>
          {busy === "delete" ? "Deleting…" : "Delete contract"}
        </button>
      </div>
      {err && <p role="alert" className="m-0 text-sm text-[#912018]">{err}</p>}

      {found.length > 0 && (
        <Card label="Savings found" className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 font-display text-[19px] font-semibold">Savings found</h2>
            <span className="text-[13px] text-muted">Estimates from this contract alone. Connecting logins and spend will firm them up.</span>
          </div>
          <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
            {found.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{o.finding}</span>
                  <span className="text-[13px] text-muted">{o.basis}</span>
                </div>
                <span className={cx("font-display text-lg font-semibold whitespace-nowrap", o.annualSavings > 0 ? "text-good" : "text-muted")}>
                  {o.annualSavings > 0 ? `up to ${usd(o.annualSavings)}/yr` : "Not sized yet"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <EmailDrafter contract={s} defaultGoal={found[0]?.goal ?? "review"} />

      <div className="flex flex-col gap-2">
        <h2 className="m-0 font-display text-[19px] font-semibold">Extracted terms</h2>
        <span className="text-[13px] text-muted">{d.agreement_name} · every value links back to the clause and page it came from</span>
      </div>
      <ExtractionCard r={s} hideHeader />
    </>
  );
}
