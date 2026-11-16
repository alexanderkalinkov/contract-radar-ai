"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { readSelection, startImport, type Selection } from "@/lib/import-client";
import { DRIVE_NAMES, pendingCount, SOURCE_NAMES, totalCount, type DriveProvider, type JobSummary } from "@/lib/imports";
import { useWorkspace } from "../WorkspaceProvider";
import { useCanWrite } from "../WriteOnly";
import { btnGhost, btnPrimary, btnSoft, cx } from "../ui";
import { IconUpload } from "../icons";

interface DriveInfo {
  provider: DriveProvider;
  name: string;
  blocker: string | null;
  connected: boolean;
  account: string | null;
}

export function BulkImport() {
  const ws = useWorkspace();
  const canWrite = useCanWrite();
  const router = useRouter();
  const q = useSearchParams();
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(q.get("drive_error"));
  const [drag, setDrag] = useState(false);
  const [browsing, setBrowsing] = useState<DriveProvider | null>((q.get("drive_connected") as DriveProvider | null) ?? null);

  const load = useCallback(async () => {
    const [j, d] = await Promise.all([fetch("/api/imports").then((r) => r.json()), fetch("/api/drives").then((r) => r.json())]);
    if (j.error) setSetupError(j.error);
    setJobs(j.jobs ?? []);
    setDrives(d.drives ?? []);
  }, []);

  useEffect(() => {
    if (ws.mode === "cloud") load().catch(() => setJobs([]));
  }, [ws.mode, load]);

  if (ws.mode !== "cloud") {
    return (
      <div className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-2">
        Bulk import saves contracts to a shared workspace, so it needs sign-in. In this demo you can still{" "}
        <Link href="/upload" className="font-semibold text-brand">upload contracts one by one</Link>.
      </div>
    );
  }

  async function pick(files: File[]) {
    setError(null);
    setScanning(true);
    try {
      const s = await readSelection(files);
      if (!s.entries.length) setError(s.ignored.length ? `No PDF or Word files in there (${s.ignored.length} other files ignored).` : "That was empty.");
      else setSelection(s);
    } catch (e) {
      setError(`Couldn't open that: ${(e as Error).message}`);
    } finally {
      setScanning(false);
    }
  }

  async function start() {
    if (!selection || !ws.workspaceId) return;
    setStarting(true);
    setError(null);
    try {
      const jobId = await startImport(selection, ws.workspaceId);
      router.push(`/import/${jobId}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  const sizeMb = selection ? selection.entries.reduce((n, e) => n + e.size, 0) / 1024 / 1024 : 0;

  return (
    <div className="flex flex-col gap-6">
      {setupError && <p className="m-0 rounded-lg border border-[#FDA29B] bg-[#FEF3F2] px-3 py-2 text-sm text-[#912018]">{setupError}</p>}
      {error && <p className="m-0 rounded-lg border border-[#FDA29B] bg-[#FEF3F2] px-3 py-2 text-sm text-[#912018]">{error}</p>}

      {!canWrite && (
        <p className="m-0 rounded-[14px] border border-line bg-white p-5 text-sm text-ink-2">
          You have read-only access to this workspace, so you can look at imports but not start one.
        </p>
      )}
      {canWrite && (
      <>
      <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-5">
        <h2 className="m-0 font-display text-base font-semibold">From your computer</h2>
        {!selection ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (e.dataTransfer.files.length) pick(Array.from(e.dataTransfer.files));
            }}
            className={cx(
              "flex min-h-[170px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center",
              drag ? "border-brand bg-brand-soft" : "border-[#D0D5DD]",
            )}
          >
            <IconUpload size={28} className="text-brand" />
            <span className="text-sm font-semibold">{scanning ? "Opening…" : "Drop a ZIP of contracts here"}</span>
            <span className="text-xs text-muted">PDF and Word (.docx) files, up to 20 MB each and {(5000).toLocaleString()} per import. Sub-folders are kept.</span>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <label className={cx(btnSoft, "cursor-pointer")}>
                Choose ZIP or files
                <input type="file" multiple accept=".zip,.pdf,.docx,application/zip,application/pdf" className="sr-only" onChange={(e) => e.target.files && pick(Array.from(e.target.files))} />
              </label>
              <label className={cx(btnSoft, "cursor-pointer")}>
                Choose a folder
                <input
                  type="file"
                  className="sr-only"
                  // @ts-expect-error: non-standard but supported by every current browser
                  webkitdirectory=""
                  onChange={(e) => e.target.files && pick(Array.from(e.target.files))}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-brand-line bg-[#F5F7FF] p-4">
            <span className="text-sm">
              <strong>{selection.name}</strong>: {selection.entries.length.toLocaleString()} contract file{selection.entries.length === 1 ? "" : "s"} ({sizeMb.toFixed(1)} MB)
              {selection.ignored.length > 0 && <span className="text-muted">, {selection.ignored.length.toLocaleString()} other files left out</span>}
            </span>
            <span className="text-[13px] text-muted">
              Files go straight to your private storage, then Claude reads them a few at a time in the background. Files you already have are spotted
              and skipped before they cost anything. You review the results before anything is added to Contracts.
            </span>
            {selection.ignored.length > 0 && (
              <details className="text-[13px] text-muted">
                <summary className="cursor-pointer">What&apos;s left out</summary>
                <ul className="m-0 mt-1 max-h-40 overflow-auto pl-5">
                  {selection.ignored.slice(0, 200).map((x) => (
                    <li key={x.path}>
                      {x.path}: {x.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} disabled={starting} onClick={start}>
                {starting ? "Starting…" : `Import ${selection.entries.length.toLocaleString()} files`}
              </button>
              <button type="button" className={btnGhost} disabled={starting} onClick={() => setSelection(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-5">
        <h2 className="m-0 font-display text-base font-semibold">From a cloud folder</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {drives.map((d) => (
            <div key={d.provider} className="flex flex-col gap-2 rounded-xl border border-line-soft p-4">
              <span className="text-sm font-semibold">{d.name}</span>
              {d.blocker ? (
                <span className="text-[13px] text-muted">Not switched on yet on this server. {d.blocker}</span>
              ) : d.connected ? (
                <>
                  <span className="text-[13px] text-muted">Connected{d.account ? ` as ${d.account}` : ""}.</span>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnSoft} onClick={() => setBrowsing(d.provider)}>Pick a folder</button>
                    <button
                      type="button"
                      className="text-[13px] font-semibold text-muted hover:underline"
                      onClick={async () => {
                        await fetch(`/api/drives/${d.provider}`, { method: "DELETE" });
                        load();
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-[13px] text-muted">Read-only access to the files you pick. You choose one folder; we read the contracts in it and its sub-folders.</span>
                  <a href={`/api/drives/${d.provider}`} className={cx(btnSoft, "self-start")}>Connect {d.name}</a>
                </>
              )}
            </div>
          ))}
        </div>
        {browsing && drives.find((d) => d.provider === browsing && d.connected) && (
          <FolderPicker provider={browsing} onClose={() => setBrowsing(null)} onPicked={(jobId) => router.push(`/import/${jobId}`)} />
        )}
      </section>
      </>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="m-0 font-display text-base font-semibold">Recent imports</h2>
        {jobs == null ? (
          <span className="text-sm text-muted">Loading…</span>
        ) : jobs.length === 0 ? (
          <span className="text-sm text-muted">None yet.</span>
        ) : (
          <div className="flex flex-col divide-y divide-line-soft rounded-[14px] border border-line bg-white">
            {jobs.map((j) => (
              <Link key={j.id} href={`/import/${j.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-[#F8FAFC]">
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{j.name}</span>
                  <span className="text-xs text-muted">
                    {SOURCE_NAMES[j.source]} · {new Date(j.created_at).toLocaleString("en-US")}
                    {j.created_by_email ? ` · ${j.created_by_email}` : ""}
                  </span>
                </span>
                <span className="text-[13px] text-ink-2">{jobLine(j)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function jobLine(j: JobSummary): string {
  const total = totalCount(j.counts);
  if (j.status === "listing") return `Finding files… ${total.toLocaleString()} so far`;
  if (j.status === "failed") return j.error ?? "Failed";
  if (j.status === "cancelled") return "Stopped";
  const pending = pendingCount(j.counts);
  if (pending) return `Reading ${(total - pending).toLocaleString()} of ${total.toLocaleString()}`;
  if (j.counts.ready) return `${j.counts.ready.toLocaleString()} waiting for review`;
  return `${j.counts.added.toLocaleString()} added`;
}

function FolderPicker({ provider, onClose, onPicked }: { provider: DriveProvider; onClose: () => void; onPicked: (jobId: string) => void }) {
  const [trail, setTrail] = useState<{ id: string; name: string; type: string }[]>([]);
  const [entries, setEntries] = useState<{ id: string; name: string; type: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = trail[trail.length - 1];

  useEffect(() => {
    setEntries(null);
    setError(null);
    fetch(`/api/drives/${provider}/browse?location=${encodeURIComponent(here?.id ?? "")}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setEntries(j.entries)))
      .catch((e) => setError((e as Error).message));
  }, [provider, here?.id]);

  async function importHere() {
    if (!here) return;
    setBusy(true);
    const res = await fetch("/api/imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: provider, folder: { id: here.id, name: here.name } }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) setError(json.error ?? "Could not start the import.");
    else onPicked(json.jobId);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand-line bg-[#F5F7FF] p-4">
      <div className="flex flex-wrap items-center gap-1 text-[13px]">
        <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setTrail([])}>{DRIVE_NAMES[provider]}</button>
        {trail.map((t, i) => (
          <span key={t.id} className="flex items-center gap-1">
            <span className="text-muted">/</span>
            <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button>
          </span>
        ))}
      </div>
      {error && <span className="text-[13px] text-[#912018]">{error}</span>}
      <div className="max-h-72 overflow-auto rounded-lg border border-line bg-white">
        {entries == null && !error && <div className="p-3 text-[13px] text-muted">Loading…</div>}
        {entries?.length === 0 && <div className="p-3 text-[13px] text-muted">No sub-folders here.</div>}
        {entries?.map((e) => (
          <button key={e.id} type="button" onClick={() => setTrail([...trail, e])} className="flex w-full items-center justify-between border-b border-line-soft px-3 py-2 text-left text-sm last:border-0 hover:bg-[#F8FAFC]">
            <span>{e.type === "site" ? "🏢 " : e.type === "drive" ? "🗄️ " : "📁 "}{e.name}</span>
            <span className="text-muted">›</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={!here || here.type === "site" || busy} onClick={importHere}>
          {busy ? "Starting…" : here && here.type !== "site" ? `Import everything in “${here.name}”` : "Open a folder to import it"}
        </button>
        <button type="button" className={btnGhost} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
