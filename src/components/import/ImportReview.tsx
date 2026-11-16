"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { readSelection, startUpload, useUploadProgress } from "@/lib/import-client";
import { FLAG_LABELS, pendingCount, SOURCE_NAMES, totalCount, type ItemView, type JobSummary } from "@/lib/imports";
import { longDate, usd } from "@/lib/format";
import { ExtractionCard } from "../Uploader";
import { useWorkspace } from "../WorkspaceProvider";
import { useCanWrite } from "../WriteOnly";
import { btnGhost, btnPrimary, btnSoft, cx } from "../ui";
import { jobLine } from "./BulkImport";

type Filter = "clean" | "flagged" | "in_progress" | "duplicate" | "failed" | "added" | "skipped";

const TABS: { id: Filter; label: string; count: (j: JobSummary) => number }[] = [
  { id: "clean", label: "Ready to add", count: (j) => j.clean },
  { id: "flagged", label: "Needs a look", count: (j) => j.counts.ready - j.clean },
  { id: "in_progress", label: "In progress", count: (j) => pendingCount(j.counts) },
  { id: "failed", label: "Couldn't read", count: (j) => j.counts.failed },
  { id: "duplicate", label: "Already have", count: (j) => j.counts.duplicate },
  { id: "added", label: "Added", count: (j) => j.counts.added },
  { id: "skipped", label: "Skipped", count: (j) => j.counts.skipped },
];

export function ImportReview({ id }: { id: string }) {
  const ws = useWorkspace();
  const upload = useUploadProgress(id);
  const canWrite = useCanWrite();
  const [job, setJob] = useState<JobSummary | null>(null);
  const [items, setItems] = useState<ItemView[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);

  const tab: Filter = filter ?? "clean";
  const load = useCallback(async () => {
    const res = await fetch(`/api/imports/${id}?filter=${tab}&page=${page}`);
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Could not load this import.");
    setJob(json.job);
    setItems(json.items);
    setTotal(json.total);
    // Open on the most useful tab the first time.
    if (firstLoad.current && filter == null) {
      firstLoad.current = false;
      const j = json.job as JobSummary;
      const best = TABS.find((t) => t.count(j) > 0)?.id ?? "clean";
      if (best !== "clean") setFilter(best);
    }
  }, [id, tab, page, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const working = job ? job.status === "listing" || pendingCount(job.counts) > 0 : true;
  useEffect(() => {
    if (!working) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [working, load]);

  async function act(body: Record<string, unknown>, done?: (j: Record<string, unknown>) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/imports/${id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok && !json.added) setMsg({ ok: false, text: json.error ?? "That didn't work." });
      else setMsg({ ok: !json.error, text: [done?.(json), json.error].filter(Boolean).join(" ") });
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function resume(files: File[]) {
    if (!ws.workspaceId) return;
    setBusy(true);
    try {
      const sel = await readSelection(files);
      const byPath = new Map(sel.entries.map((e) => [e.path, e]));
      const waiting: { id: string; entry: (typeof sel.entries)[number] }[] = [];
      for (let p = 0; p < 60; p++) {
        const j = await fetch(`/api/imports/${id}?filter=in_progress&page=${p}`).then((r) => r.json());
        for (const it of (j.items ?? []) as ItemView[]) {
          const e = it.status === "waiting_upload" ? byPath.get(it.folder ? `${it.folder}/${it.file_name}` : it.file_name) : undefined;
          if (e) waiting.push({ id: it.id, entry: e });
        }
        if ((j.items ?? []).length < 100) break;
      }
      if (!waiting.length) setMsg({ ok: false, text: "None of the files still waiting are in what you picked. Pick the same ZIP or folder as before." });
      else void startUpload(id, ws.workspaceId, waiting);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="m-0 rounded-lg border border-[#FDA29B] bg-[#FEF3F2] px-3 py-2 text-sm text-[#912018]">{error}</p>;
  if (!job) return <span className="text-sm text-muted">Loading…</span>;

  const all = totalCount(job.counts);
  const finished = all - pendingCount(job.counts);
  const pct = all ? Math.round((finished / all) * 100) : 0;
  const uploadStalled = job.counts.waiting_upload > 0 && (!upload || upload.done);
  const selectable = canWrite && (tab === "clean" || tab === "flagged" || tab === "failed");
  const pages = Math.ceil(total / 100);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-muted">
            {SOURCE_NAMES[job.source]} · started {new Date(job.created_at).toLocaleString("en-US")}
            {job.created_by_email ? ` by ${job.created_by_email}` : ""}
          </span>
          <span className="text-sm font-semibold">{jobLine(job)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-[#E0E7FF]">
          <div className={cx("h-2 rounded bg-brand transition-all", job.status === "listing" && "w-1/3 animate-[cr-progress_1.4s_ease-in-out_infinite]")} style={job.status === "listing" ? undefined : { width: `${pct}%` }} />
        </div>
        {upload && !upload.done && (
          <span className="text-[13px] text-brand-dark">
            Uploading from this browser: {(upload.sent + upload.duplicates + upload.failed).toLocaleString()} of {upload.total.toLocaleString()} files
            {upload.duplicates ? ` (${upload.duplicates} you already have, not uploaded)` : ""}. Keep this tab open until it finishes; you can use the rest of the app meanwhile.
          </span>
        )}
        {upload?.error && <span className="text-[13px] text-[#912018]">Upload stopped: {upload.error}</span>}
        {uploadStalled && canWrite && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px]">
            <span>{job.counts.waiting_upload.toLocaleString()} files were never uploaded (the tab was probably closed). Pick the same ZIP or folder to send the rest.</span>
            <label className={cx(btnSoft, "cursor-pointer")}>
              Pick it again
              <input type="file" multiple accept=".zip,.pdf,.docx" className="sr-only" onChange={(e) => e.target.files && resume(Array.from(e.target.files))} />
            </label>
            <button type="button" className="font-semibold text-muted hover:underline" onClick={() => fetch(`/api/imports/${id}/files`, { method: "POST", body: JSON.stringify({ action: "finished" }) }).then(load)}>
              Forget them
            </button>
          </div>
        )}
        {job.status === "failed" && job.error && <span className="text-[13px] text-[#912018]">{job.error}</span>}
        {job.status !== "failed" && job.error && <span className="text-[13px] text-muted">{job.error}</span>}
        {working && (
          <span className="text-[13px] text-muted">
            Claude reads a few files at a time, about a minute each, so large imports take a while. It carries on if you close this page; come back any time.
          </span>
        )}
        <div className={cx("flex flex-wrap gap-2", !canWrite && "hidden")}>
          {job.clean > 0 && (
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => act({ action: "add", clean: true }, (j) => `Added ${j.added} contracts.`)}>
              Add all {job.clean.toLocaleString()} ready contracts
            </button>
          )}
          {job.counts.failed > 0 && (
            <button type="button" className={btnGhost} disabled={busy} onClick={() => act({ action: "retry" }, (j) => `Reading ${j.retried} files again.`)}>
              Retry files that failed
            </button>
          )}
          {working && (
            <button type="button" className={btnGhost} disabled={busy} onClick={() => act({ action: "cancel" }, () => "Stopped. Files already read stay here for review.")}>
              Stop the import
            </button>
          )}
        </div>
        {msg && <span className={cx("text-[13px] font-semibold", msg.ok ? "text-good-dark" : "text-[#912018]")}>{msg.text}</span>}
      </section>

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            onClick={() => {
              setFilter(t.id);
              setPage(0);
              setSelected(new Set());
            }}
            className={cx("min-h-9 rounded-full px-3 text-[13px] font-semibold", tab === t.id ? "bg-navy text-white" : "bg-chip text-ink-2 hover:bg-[#E4E7EC]")}
          >
            {t.label} · {t.count(job).toLocaleString()}
          </button>
        ))}
      </div>

      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{selected.size} selected</span>
          {tab !== "failed" && (
            <button type="button" className={btnSoft} disabled={busy} onClick={() => act({ action: "add", ids: [...selected] }, (j) => `Added ${j.added} contracts.`)}>
              Add to Contracts
            </button>
          )}
          <button type="button" className={btnSoft} disabled={busy} onClick={() => act({ action: "skip", ids: [...selected] }, () => "Skipped.")}>
            Leave out
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-muted">
              {selectable && (
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={items.length > 0 && items.every((i) => selected.has(i.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
                  />
                </th>
              )}
              <th className="px-3 py-2.5">FILE</th>
              <th className="px-3 py-2.5">VENDOR</th>
              <th className="px-3 py-2.5">ANNUAL FEE</th>
              <th className="px-3 py-2.5">TERM ENDS</th>
              <th className="px-3 py-2.5">NOTICE BY</th>
              <th className="px-3 py-2.5">{tab === "failed" ? "WHY" : "NOTES"}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">Nothing here.</td>
              </tr>
            )}
            {items.map((it) => (
              <Row
                key={it.id}
                it={it}
                selectable={selectable}
                checked={selected.has(it.id)}
                onCheck={(v) => {
                  const s = new Set(selected);
                  if (v) s.add(it.id);
                  else s.delete(it.id);
                  setSelected(s);
                }}
                open={open === it.id}
                onToggle={() => setOpen(open === it.id ? null : it.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" className={btnGhost} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="text-muted">Page {page + 1} of {pages}</span>
          <button type="button" className={btnGhost} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  waiting_upload: "Waiting to upload",
  queued: "Waiting to be read",
  processing: "Reading now…",
  duplicate: "Same file is already in this workspace",
  skipped: "Left out",
};

function Row({ it, selectable, checked, onCheck, open, onToggle }: { it: ItemView; selectable: boolean; checked: boolean; onCheck: (v: boolean) => void; open: boolean; onToggle: () => void }) {
  const fee = it.annual_fee != null ? `${usd(it.annual_fee)}${it.currency && it.currency !== "USD" ? ` ${it.currency}` : ""}` : "—";
  const notes =
    it.status === "failed"
      ? it.error ?? "Failed"
      : it.status === "ready"
        ? it.flags.map((f) => FLAG_LABELS[f]).join(" · ") || (it.demo ? "Sample result (no API key)" : "")
        : it.status === "added"
          ? ""
          : (STATUS_TEXT[it.status] ?? "");
  return (
    <>
      <tr className="border-b border-line-soft align-top last:border-0">
        {selectable && (
          <td className="px-3 py-2.5">
            <input type="checkbox" aria-label={`Select ${it.file_name}`} checked={checked} onChange={(e) => onCheck(e.target.checked)} />
          </td>
        )}
        <td className="max-w-[260px] px-3 py-2.5">
          {it.extraction ? (
            <button type="button" onClick={onToggle} className="text-left font-semibold text-brand hover:underline">{it.file_name}</button>
          ) : (
            <span className="font-semibold">{it.file_name}</span>
          )}
          {it.folder && <div className="truncate text-xs text-muted">{it.folder}</div>}
        </td>
        <td className="px-3 py-2.5">
          {it.status === "added" ? <Link href={`/contracts/${it.id}`} className="font-semibold text-brand hover:underline">{it.vendor ?? "Open"}</Link> : (it.vendor ?? "—")}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">{fee}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">{it.term_end ? longDate(it.term_end) : "—"}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">{it.notice_deadline ? longDate(it.notice_deadline) : "—"}</td>
        <td className={cx("px-3 py-2.5 text-[13px]", it.status === "failed" ? "text-[#912018]" : it.flags.length ? "text-warn-text" : "text-muted")}>{notes}</td>
      </tr>
      {open && it.extraction && (
        <tr className="border-b border-line-soft bg-[#F8FAFC]">
          <td colSpan={7} className="p-3">
            <ExtractionCard r={{ fileName: it.file_name, extractedAt: new Date().toISOString(), demo: it.demo, model: it.model ?? undefined, data: it.extraction, noticeDeadline: it.notice_deadline }} savedNote={it.status === "added" ? "added to Contracts" : "not in Contracts yet"} />
          </td>
        </tr>
      )}
    </>
  );
}
