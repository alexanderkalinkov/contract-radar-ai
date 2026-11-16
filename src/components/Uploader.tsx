"use client";

import Link from "next/link";
import { useState } from "react";
import { REVIEW_FIELDS, type Extraction, type ExtractionResult, type FieldKey } from "@/lib/extraction";
import { FIELD_INPUT, FIELD_LABELS, parseCorrection, quickConfirmable, reviewProgress, type ReviewAction, type ReviewValue } from "@/lib/review";
import type { SavedContract } from "@/lib/saved";
import { useSavedContracts } from "@/lib/portfolio";
import { daysUntil } from "@/lib/engine";
import { longDate, usd } from "@/lib/format";
import { useWorkspace } from "./WorkspaceProvider";
import { createClient } from "@/lib/supabase/client";
import { CONTRACTS_BUCKET } from "@/lib/supabase/config";
import { btnSoft, ConfidenceTag, cx } from "./ui";
import { IconUpload } from "./icons";

const MAX_BYTES = 20 * 1024 * 1024;

type Job = { id: string; name: string; status: "reading" | "done" | "error"; error?: string; result?: SavedContract };

export function Uploader({ compact = false }: { compact?: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const { add } = useSavedContracts();
  const ws = useWorkspace();
  const [drag, setDrag] = useState(false);

  async function handle(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const id = Math.random().toString(36).slice(2);
      setJobs((j) => [{ id, name: file.name, status: "reading" }, ...j]);
      try {
        if (file.size > MAX_BYTES) throw new Error("PDF is larger than 20 MB.");
        let res: Response;
        if (ws.mode === "cloud" && ws.workspaceId) {
          // Signed in: the PDF goes straight from the browser to the workspace's private storage folder, then the
          // server reads it from there. This keeps large files clear of hosting request-size limits (4.5 MB on Vercel).
          const contractId = crypto.randomUUID();
          const path = `${ws.workspaceId}/${contractId}.pdf`;
          const { error: upErr } = await createClient()
            .storage.from(CONTRACTS_BUCKET)
            .upload(path, file, { contentType: "application/pdf", upsert: false });
          if (upErr) throw new Error(`Could not upload the PDF: ${upErr.message}`);
          res = await fetch("/api/extract", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: contractId, fileName: file.name }),
          });
        } else {
          const body = new FormData();
          body.append("file", file);
          res = await fetch("/api/extract", { method: "POST", body });
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
        const result = json as SavedContract;
        setJobs((j) => j.map((x) => (x.id === id ? { ...x, status: "done", result } : x)));
        add(result);
      } catch (e) {
        setJobs((j) => j.map((x) => (x.id === id ? { ...x, status: "error", error: (e as Error).message } : x)));
      }
    }
  }

  async function trySample() {
    const res = await fetch("/samples/acme-analytics-msa.pdf");
    const blob = await res.blob();
    handle([new File([blob], "acme-analytics-msa.pdf", { type: "application/pdf" })]);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) handle(e.dataTransfer.files);
        }}
        className={cx(
          "relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center",
          compact ? "min-h-[96px] p-4" : "min-h-[180px] p-8",
          drag ? "border-brand bg-brand-soft" : "border-[#D0D5DD] bg-white hover:border-[#98A2B3]",
        )}
      >
        <IconUpload size={compact ? 20 : 28} className="text-brand" />
        <span className="text-sm font-semibold text-brand">Drop a contract PDF here</span>
        <span className="text-xs text-muted">or click to browse · MSA, order form or renewal quote · up to 20 MB</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) handle(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <span className="text-xs text-muted">
        No contract handy?{" "}
        <button type="button" onClick={trySample} className="font-semibold text-brand hover:underline">
          Try the sample Acme Analytics MSA
        </button>{" "}
        (<a href="/samples/acme-analytics-msa.pdf" target="_blank" className="text-brand">view PDF</a>)
      </span>

      {jobs.map((j) => (
        <div key={j.id}>
          {j.status === "reading" && (
            <div className="flex flex-col gap-2 rounded-xl border border-brand-line bg-[#F5F7FF] p-3.5">
              <span className="text-sm font-semibold">{j.name}</span>
              <span className="text-[13px] font-medium text-brand-dark">Reading clauses with Claude. This takes about a minute.</span>
              <div className="h-1.5 overflow-hidden rounded bg-[#E0E7FF]">
                <div className="h-1.5 w-1/3 animate-[cr-progress_1.4s_ease-in-out_infinite] rounded bg-brand" />
              </div>
            </div>
          )}
          {j.status === "error" && (
            <div className="rounded-xl border border-[#FDA29B] bg-[#FEF3F2] p-3.5 text-sm">
              <span className="font-semibold">{j.name}</span>
              <p className="m-0 mt-1 text-[#912018]">{j.error}</p>
            </div>
          )}
          {j.status === "done" && j.result && !compact && (
            <div className="flex flex-col gap-2">
              <Link href={`/contracts/${j.result.id}`} className="self-start text-sm font-semibold text-brand hover:underline">
                Saved to Contracts · open the contract page →
              </Link>
              <ExtractionCard r={j.result} />
            </div>
          )}
          {j.status === "done" && j.result && compact && <ExtractionSummary r={j.result} />}
        </div>
      ))}
    </div>
  );
}

export function ExtractionSummary({ r }: { r: SavedContract }) {
  const d = r.data;
  const bits = [
    r.noticeDeadline && `notice ${longDate(r.noticeDeadline)}`,
    d.uplift_cap_percent.value != null ? `${d.uplift_cap_percent.value}% cap found` : "no uplift cap",
    d.auto_renewal.value ? "auto-renews" : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-good-line bg-[#F6FEF9] p-3.5">
      <Link href={`/contracts/${r.id}`} className="text-sm font-semibold text-ink hover:underline">{r.fileName}</Link>
      <span className="text-[13px] font-semibold text-good-dark">Done: {bits.join(", ")}</span>
      {r.demo && <span className="text-xs text-muted">Demo result (no API key set)</span>}
    </div>
  );
}

/** How a term's value reads on screen. */
function formatField(d: Extraction, k: FieldKey, value: ReviewValue = d[k].value as ReviewValue): string {
  if (value == null) return k === "uplift_cap_percent" ? "No cap found" : "Not found";
  switch (k) {
    case "term_end":
      return longDate(String(value));
    case "auto_renewal":
      return value ? `Yes${d.auto_renewal.renewal_term_months ? `, ${d.auto_renewal.renewal_term_months}-month terms` : ""}` : "No";
    case "notice_period_days":
      return `${value} days`;
    case "uplift_cap_percent":
      return `${value}% per renewal`;
    case "seat_reduction_percent":
      return `Up to ${value}% at renewal`;
    case "annual_fee":
      return `${usd(Number(value))}${d.currency && d.currency !== "USD" ? ` ${d.currency}` : ""}`;
    default:
      return String(value);
  }
}

type ReviewFn = (a: ReviewAction) => Promise<void>;

/**
 * The extracted terms, each with the passage and page it came from. With onReview (a saved contract), each term can
 * be confirmed or corrected, so Legal and Finance can sign off on what the AI read.
 */
export function ExtractionCard({
  r,
  hideHeader = false,
  onReview,
  onOpenPage,
}: {
  r: ExtractionResult;
  hideHeader?: boolean;
  onReview?: ReviewFn;
  onOpenPage?: (page: number) => void;
}) {
  const ws = useWorkspace();
  const d = r.data;
  const days = r.noticeDeadline ? daysUntil(r.noticeDeadline) : null;
  const progress = reviewProgress(d);
  const quick = quickConfirmable(d);
  const [busyAll, setBusyAll] = useState(false);
  const [errAll, setErrAll] = useState<string | null>(null);

  async function confirmQuick() {
    if (!onReview) return;
    setBusyAll(true);
    setErrAll(null);
    try {
      await onReview({ action: "confirm", fields: quick });
    } catch (e) {
      setErrAll((e as Error).message);
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-5">
      <div className={cx("flex flex-wrap items-start justify-between gap-3", hideHeader && "hidden")}>
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-lg font-semibold">{d.vendor}</span>
          <span className="text-[13px] text-muted">
            {d.agreement_name} · {r.fileName}
          </span>
        </div>
        <div className={cx("flex flex-col items-end rounded-xl px-4 py-2.5", days != null && days <= 30 ? "bg-warn-soft" : "bg-chip")}>
          <span className="text-xs font-semibold tracking-wide text-muted">NOTICE DEADLINE</span>
          <span className="font-display text-xl font-semibold">
            {r.noticeDeadline ? `${longDate(r.noticeDeadline)}${days != null ? ` · ${days} days` : ""}` : "Not found"}
          </span>
        </div>
      </div>
      {r.demo && (
        <p className="m-0 rounded-lg bg-brand-soft px-3 py-2 text-[13px] text-brand-dark">
          Sample extraction: no ANTHROPIC_API_KEY is set on the server, so these are example results, not your PDF. Add a key to read your own contracts.
        </p>
      )}
      {onReview && (
        <div
          className={cx(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
            progress.reviewed === progress.total ? "border-good-line bg-[#F6FEF9]" : "border-line bg-[#F8FAFC]",
          )}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">
              {progress.reviewed === progress.total ? "All terms reviewed" : `${progress.reviewed} of ${progress.total} terms reviewed`}
              {progress.corrected > 0 && ` · ${progress.corrected} corrected`}
            </span>
            <span className="text-[13px] text-muted">Check each value against its source quote, then confirm it or correct it. Corrections update deadlines and reminders.</span>
          </div>
          {quick.length > 0 && (
            <button type="button" className={btnSoft} onClick={confirmQuick} disabled={busyAll}>
              {busyAll ? "Saving…" : `Confirm ${quick.length} verified, high-confidence ${quick.length === 1 ? "term" : "terms"}`}
            </button>
          )}
          {errAll && <span role="alert" className="w-full text-[13px] text-[#912018]">{errAll}</span>}
        </div>
      )}
      <div className="flex flex-col divide-y divide-line-soft">
        {REVIEW_FIELDS.map((k) => (
          <TermRow key={k} d={d} k={k} onReview={onReview} onOpenPage={onOpenPage} />
        ))}
      </div>
      {d.risks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-2">Worth knowing</span>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
            {d.risks.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <span className="text-xs text-muted">
        {r.demo ? "Sample data" : `Read by ${r.model}`} · {new Date(r.extractedAt).toLocaleString("en-US")} · {ws.mode === "cloud" ? `saved to ${ws.workspaceName}` : "saved in this browser (demo mode)"}
      </span>
    </div>
  );
}

const linkBtn = "font-semibold text-brand hover:underline disabled:opacity-50";

function TermRow({ d, k, onReview, onOpenPage }: { d: Extraction; k: FieldKey; onReview?: ReviewFn; onOpenPage?: (page: number) => void }) {
  const f = d[k];
  const review = d.reviews?.[k];
  const checked = d.verified ? Boolean(d.verified[k]) : null; // null: read before quotes were checked
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const kind = FIELD_INPUT[k];

  async function run(a: ReviewAction) {
    if (!onReview) return;
    setBusy(true);
    setErr(null);
    try {
      await onReview(a);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    const v = f.value as ReviewValue;
    setDraft(v == null ? "" : String(v));
    setErr(null);
    setEditing(true);
  }

  function save() {
    const raw = kind === "boolean" ? (draft === "" ? null : draft === "true") : draft.trim();
    const parsed = parseCorrection(k, raw);
    if ("error" in parsed) return setErr(parsed.error);
    run({ action: "correct", field: k, value: parsed.value });
  }

  const who = (r: { by: string | null; at: string }) => `${r.by ? `by ${r.by} ` : ""}on ${longDate(r.at.slice(0, 10))}`;

  return (
    <div className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          <span className="text-muted">{FIELD_LABELS[k]}: </span>
          <strong>{formatField(d, k)}</strong>
          {review?.status === "corrected" && <span className="ml-1.5 text-[13px] text-muted line-through">{formatField(d, k, review.original ?? null)}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {f.page != null &&
            (onOpenPage ? (
              <button type="button" className={linkBtn} onClick={() => onOpenPage(f.page!)}>
                page {f.page}
              </button>
            ) : (
              `page ${f.page}`
            ))}
          {f.quote && checked === true && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold whitespace-nowrap text-brand-dark" title="This quote was copied from the document by Claude's citations, not written by the model.">
              Quote found in document
            </span>
          )}
          {f.quote && checked === false && (
            <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold whitespace-nowrap text-warn-text" title="Claude could not point to this exact text in the document. Check it against the original before relying on it.">
              Quote not matched
            </span>
          )}
          <ConfidenceTag level={f.confidence} />
        </span>
      </div>
      {f.quote && (
        <blockquote className="m-0 rounded-lg bg-[#F8FAFC] px-3 py-2 font-serif text-[13px] leading-relaxed text-ink-2">&ldquo;{f.quote}&rdquo;</blockquote>
      )}
      {onReview && !editing && (
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          {review ? (
            <>
              <span className={cx("font-semibold", review.status === "confirmed" ? "text-good-dark" : "text-brand-dark")}>
                {review.status === "confirmed" ? "✓ Confirmed" : "✎ Corrected"} {who(review)}
              </span>
              <button type="button" className={linkBtn} onClick={startEdit} disabled={busy}>
                Correct
              </button>
              <button type="button" className={linkBtn} onClick={() => run({ action: "reset", field: k })} disabled={busy}>
                {review.status === "corrected" ? "Undo correction" : "Undo"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={linkBtn} onClick={() => run({ action: "confirm", fields: [k] })} disabled={busy}>
                {busy ? "Saving…" : "Confirm"}
              </button>
              <button type="button" className={linkBtn} onClick={startEdit} disabled={busy}>
                Correct
              </button>
            </>
          )}
        </div>
      )}
      {editing && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {kind === "boolean" ? (
            <select value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-9 rounded-lg border border-[#D0D5DD] bg-white px-2 text-[13px]" aria-label={FIELD_LABELS[k]}>
              <option value="true">Yes, renews automatically</option>
              <option value="false">No</option>
              <option value="">Not in the contract</option>
            </select>
          ) : (
            <input
              type={kind === "date" ? "date" : "text"}
              inputMode={kind === "date" ? undefined : "decimal"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder={kind === "date" ? "YYYY-MM-DD" : "Leave empty if not in the contract"}
              aria-label={FIELD_LABELS[k]}
              className="min-h-9 w-56 max-w-full rounded-lg border border-[#D0D5DD] bg-white px-2 text-[13px]"
              autoFocus
            />
          )}
          <button type="button" className={btnSoft} onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className={linkBtn} onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
      {err && <span role="alert" className="text-[13px] text-[#912018]">{err}</span>}
    </div>
  );
}
