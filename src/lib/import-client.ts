"use client";

// Browser side of a ZIP or folder import: unpack the ZIP locally, fingerprint each file, skip ones the
// workspace already has, and upload the rest straight to private storage. Uploads keep going while the
// person moves around the app (they live in this module, not in a component). Closing the tab stops them;
// the import page can resume by picking the same ZIP or folder again.
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { CONTRACTS_BUCKET } from "@/lib/supabase/config";
import { fileKind, isJunkPath, MAX_FILE_BYTES, type FileKind } from "./imports";

export interface LocalEntry {
  path: string;
  size: number;
  kind: FileKind | null;
  blob: () => Promise<Blob>;
}

export interface Selection {
  source: "zip" | "files";
  name: string;
  entries: LocalEntry[];
  /** Files that will be left out, with why (not PDF/Word, too big, encrypted). */
  ignored: { path: string; reason: string }[];
}

const MIME: Record<FileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const relPath = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

/** Turns what the person dropped or picked (ZIPs and/or loose files) into a flat list of files to import. */
export async function readSelection(files: File[]): Promise<Selection> {
  const zips = files.filter((f) => f.name.toLowerCase().endsWith(".zip"));
  const loose = files.filter((f) => !f.name.toLowerCase().endsWith(".zip"));
  const entries: LocalEntry[] = [];
  const ignored: Selection["ignored"] = [];
  const add = (path: string, size: number, blob: () => Promise<Blob>, encrypted = false) => {
    const clean = path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!clean || isJunkPath(clean)) return;
    const kind = fileKind(clean);
    if (!kind) ignored.push({ path: clean, reason: "Not a PDF or Word (.docx) file" });
    else if (encrypted) ignored.push({ path: clean, reason: "Password-protected inside the ZIP" });
    else if (size > MAX_FILE_BYTES) ignored.push({ path: clean, reason: "Larger than 20 MB" });
    else if (size <= 0) ignored.push({ path: clean, reason: "Empty file" });
    else entries.push({ path: clean, size, kind, blob });
  };

  if (zips.length) {
    const { ZipReader, BlobReader, BlobWriter, configure } = await import("@zip.js/zip.js");
    configure({ useWebWorkers: false });
    for (const z of zips) {
      // Random access through Blob.slice: even a multi-GB ZIP is never loaded into memory at once.
      const reader = new ZipReader(new BlobReader(z));
      const prefix = zips.length > 1 ? `${z.name.replace(/\.zip$/i, "")}/` : "";
      for (const e of await reader.getEntries()) {
        if (e.directory) continue;
        add(prefix + e.filename, e.uncompressedSize, () => e.getData(new BlobWriter()), e.encrypted);
      }
    }
  }
  for (const f of loose) add(relPath(f), f.size, async () => f);

  const name =
    zips.length === 1 && !loose.length
      ? zips[0].name
      : (loose[0] && relPath(loose[0]).includes("/") ? relPath(loose[0]).split("/")[0] : null) ?? `${entries.length} files`;
  return { source: zips.length ? "zip" : "files", name, entries, ignored };
}

// ---------------------------------------------------------------------------
// Upload manager
// ---------------------------------------------------------------------------

export interface UploadProgress {
  total: number;
  sent: number;
  duplicates: number;
  failed: number;
  done: boolean;
  error: string | null;
}

const uploads = new Map<string, UploadProgress>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function patch(jobId: string, p: Partial<UploadProgress>) {
  const cur = uploads.get(jobId);
  if (cur) uploads.set(jobId, { ...cur, ...p });
  emit();
}

export function useUploadProgress(jobId: string): UploadProgress | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => uploads.get(jobId) ?? null,
    () => null,
  );
}

export const anyUploadRunning = () => [...uploads.values()].some((u) => !u.done);

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (anyUploadRunning()) e.preventDefault();
  });
}

async function post(jobId: string, body: unknown) {
  const res = await fetch(`/api/imports/${jobId}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Server answered ${res.status}`);
  return json;
}

async function sha256(blob: Blob): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

const BATCH = 8;

/** Uploads every file of a job. `files` pairs each server item id with the local file. */
export async function startUpload(jobId: string, workspaceId: string, files: { id: string; entry: LocalEntry }[], opts: { finish?: boolean } = {}) {
  if (uploads.get(jobId) && !uploads.get(jobId)!.done) return;
  uploads.set(jobId, { total: files.length, sent: 0, duplicates: 0, failed: 0, done: false, error: null });
  emit();
  const storage = createClient().storage.from(CONTRACTS_BUCKET);
  let sent = 0;
  let duplicates = 0;
  let failed = 0;
  try {
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const blobs = new Map<string, Blob>();
      const hashes: { id: string; sha256: string }[] = [];
      const broken: { id: string; error: string }[] = [];
      for (const f of batch) {
        try {
          const b = await f.entry.blob();
          blobs.set(f.id, b);
          hashes.push({ id: f.id, sha256: await sha256(b) });
        } catch (e) {
          broken.push({ id: f.id, error: `Couldn't unpack this file: ${(e as Error).message}` });
        }
      }
      const { upload, duplicates: dups } = hashes.length ? ((await post(jobId, { action: "hash", items: hashes })) as { upload: string[]; duplicates: string[] }) : { upload: [], duplicates: [] };
      duplicates += dups.length;
      const ok: string[] = [];
      await Promise.all(
        upload.map(async (id) => {
          const f = batch.find((x) => x.id === id)!;
          const kind = f.entry.kind ?? "pdf";
          // Files unpacked from a ZIP have no type, and storage-js sends a Blob's own type (not contentType), which the
          // bucket rejects as application/octet-stream. Re-wrap every file with the right type.
          const typed = new Blob([blobs.get(id)!], { type: MIME[kind] });
          const { error } = await storage.upload(`${workspaceId}/${id}.${kind}`, typed, { contentType: MIME[kind], upsert: false });
          // Already there (a resumed upload whose first try got through): that's fine.
          if (error && !/exists|duplicate/i.test(error.message)) broken.push({ id, error: `Upload failed: ${error.message}` });
          else ok.push(id);
        }),
      );
      if (ok.length) await post(jobId, { action: "uploaded", ids: ok });
      if (broken.length) await post(jobId, { action: "failed", items: broken });
      sent += ok.length;
      failed += broken.length;
      patch(jobId, { sent, duplicates, failed });
    }
    if (opts.finish !== false) await post(jobId, { action: "finished" });
    patch(jobId, { done: true });
  } catch (e) {
    patch(jobId, { done: true, error: (e as Error).message });
  }
}

/** Creates an import job for a selection and starts uploading it. Returns the job id. */
export async function startImport(sel: Selection, workspaceId: string): Promise<string> {
  const res = await fetch("/api/imports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: sel.source, name: sel.name, files: sel.entries.map((e) => ({ path: e.path, size: e.size })) }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Server answered ${res.status}`);
  const byPath = new Map(sel.entries.map((e) => [e.path, e]));
  const files = (json.items as { id: string; path: string }[]).flatMap((it) => (byPath.has(it.path) ? [{ id: it.id, entry: byPath.get(it.path)! }] : []));
  void startUpload(json.jobId, workspaceId, files);
  return json.jobId as string;
}
