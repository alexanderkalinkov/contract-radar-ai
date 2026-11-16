import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guessCategory } from "@/lib/team/types";
import {
  departmentFor,
  emptyCounts,
  fileKind,
  isJunkPath,
  ITEM_STATUSES,
  MAX_FILE_BYTES,
  MAX_IMPORT_FILES,
  splitPath,
  type Counts,
  type ItemView,
  type JobSummary,
} from "@/lib/imports";
import type { Extraction } from "@/lib/extraction";
import { extractionColumns } from "@/lib/saved";
import { CONTRACTS_BUCKET } from "@/lib/supabase/config";
import { getBillingRowAdmin, isBillingConfigured, limitReasonAdmin, summarize } from "../billing";
import { finalizeJob } from "./worker";

type Db = SupabaseClient;

const JOB_COLS = "id, name, source, status, error, created_at, created_by_email";
const ITEM_COLS =
  "id, file_name, folder, kind, size, status, error, flags, vendor, term_end, annual_fee, currency, notice_deadline, demo, model, duplicate_of, department_id, extraction";

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function jobCounts(db: Db, jobId: string): Promise<{ counts: Counts; clean: number }> {
  const counts = emptyCounts();
  const head = () => db.from("import_items").select("id", { count: "exact", head: true }).eq("job_id", jobId);
  const results = await Promise.all([...ITEM_STATUSES.map((s) => head().eq("status", s)), head().eq("status", "ready").eq("flags", "{}")]);
  ITEM_STATUSES.forEach((s, i) => (counts[s] = results[i].count ?? 0));
  return { counts, clean: results[ITEM_STATUSES.length].count ?? 0 };
}

export async function listJobs(db: Db, ws: string): Promise<JobSummary[]> {
  const { data, error } = await db.from("import_jobs").select(JOB_COLS).eq("workspace_id", ws).order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  return Promise.all((data ?? []).map(async (j) => ({ ...(j as Omit<JobSummary, "counts" | "clean">), ...(await jobCounts(db, j.id)) })));
}

export async function getJob(db: Db, ws: string, jobId: string): Promise<JobSummary | null> {
  const { data } = await db.from("import_jobs").select(JOB_COLS).eq("workspace_id", ws).eq("id", jobId).maybeSingle();
  if (!data) return null;
  return { ...(data as Omit<JobSummary, "counts" | "clean">), ...(await jobCounts(db, jobId)) };
}

export type ItemFilter = "ready" | "clean" | "flagged" | "in_progress" | "duplicate" | "failed" | "added" | "skipped" | "all";
export const ITEM_FILTERS: ItemFilter[] = ["ready", "clean", "flagged", "in_progress", "duplicate", "failed", "added", "skipped", "all"];

export const PAGE_SIZE = 100;

export async function listItems(db: Db, jobId: string, filter: ItemFilter, page: number): Promise<{ items: ItemView[]; total: number }> {
  let q = db.from("import_items").select(ITEM_COLS, { count: "exact" }).eq("job_id", jobId);
  if (filter === "ready") q = q.eq("status", "ready");
  else if (filter === "clean") q = q.eq("status", "ready").eq("flags", "{}");
  else if (filter === "flagged") q = q.eq("status", "ready").neq("flags", "{}");
  else if (filter === "in_progress") q = q.in("status", ["waiting_upload", "queued", "processing"]);
  else if (filter !== "all") q = q.eq("status", filter);
  const order = filter === "ready" || filter === "clean" || filter === "flagged" ? "notice_deadline" : "created_at";
  const { data, count, error } = await q
    .order(order, { ascending: true, nullsFirst: false })
    .order("id")
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { items: (data ?? []) as ItemView[], total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Creating a job from a ZIP or a folder of files
// ---------------------------------------------------------------------------

export interface NewFile {
  path: string;
  size: number;
}

export interface SessionLike {
  userId: string;
  email: string;
  workspace: { id: string };
}

/**
 * Registers the files the browser found. Returns an id per accepted file (the browser uploads each to
 * <workspace>/<id>.<pdf|docx>) and the files it left out, with why.
 */
export async function createUploadJob(db: Db, session: SessionLike, source: "zip" | "files", name: string, files: NewFile[]) {
  const ws = session.workspace.id;
  const accepted: { path: string; folder: string | null; name: string; kind: "pdf" | "docx"; size: number }[] = [];
  const rejected: { path: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const path = String(f.path ?? "").replace(/\\/g, "/").slice(0, 600);
    const size = Number(f.size);
    if (!path || seen.has(path) || isJunkPath(path)) continue;
    seen.add(path);
    const { folder, name: base } = splitPath(path);
    const kind = fileKind(base);
    if (!kind) rejected.push({ path, reason: "Not a PDF or Word (.docx) file" });
    else if (!Number.isFinite(size) || size <= 0) rejected.push({ path, reason: "Empty file" });
    else if (size > MAX_FILE_BYTES) rejected.push({ path, reason: "Larger than 20 MB" });
    else if (accepted.length >= MAX_IMPORT_FILES) rejected.push({ path, reason: `Only ${MAX_IMPORT_FILES} files per import` });
    else accepted.push({ path, folder, name: base.slice(0, 250), kind, size });
  }
  if (!accepted.length) return { error: "No PDF or Word (.docx) files to import.", rejected };

  // A ZIP of one top folder ("Contracts 2026/…") shouldn't count that folder as a department.
  const tops = new Set(accepted.map((a) => a.folder?.split("/")[0] ?? ""));
  const { data: depts } = await db.from("departments").select("id, name").eq("workspace_id", ws);

  const { data: job, error } = await db
    .from("import_jobs")
    .insert({ workspace_id: ws, created_by: session.userId, created_by_email: session.email, source, name: name.slice(0, 300) || "Import", status: "uploading" })
    .select("id")
    .single();
  if (error || !job) throw new Error(error?.message ?? "Could not start the import.");

  const items: { id: string; path: string }[] = [];
  for (const part of chunks(accepted, 500)) {
    const rows = part.map((a) => ({
      job_id: job.id,
      workspace_id: ws,
      file_name: a.name,
      folder: a.folder,
      kind: a.kind,
      size: a.size,
      status: "waiting_upload",
      department_id: departmentFor(tops.size === 1 && a.folder ? a.folder.split("/").slice(1).join("/") || null : a.folder, depts ?? []),
    }));
    const { data, error: insErr } = await db.from("import_items").insert(rows).select("id");
    if (insErr || !data) throw new Error(insErr?.message ?? "Could not save the file list.");
    data.forEach((d, i) => items.push({ id: d.id, path: part[i].path }));
  }
  return { jobId: job.id as string, items, rejected };
}

/** Before uploading: which of these files (by SHA-256) does the workspace already have? Those are marked duplicate. */
export async function checkHashes(db: Db, ws: string, jobId: string, hashes: { id: string; sha256: string }[]) {
  const valid = hashes.filter((h) => /^[0-9a-f]{64}$/.test(h.sha256));
  const list = [...new Set(valid.map((h) => h.sha256))];
  const known = new Map<string, string>();
  if (list.length) {
    const { data: c } = await db.from("contracts").select("id, file_hash").eq("workspace_id", ws).in("file_hash", list);
    for (const r of c ?? []) known.set(r.file_hash, r.id);
    const { data: i } = await db
      .from("import_items")
      .select("id, sha256")
      .eq("workspace_id", ws)
      .in("sha256", list)
      .in("status", ["queued", "processing", "ready", "added"]);
    for (const r of i ?? []) if (!known.has(r.sha256)) known.set(r.sha256, r.id);
  }
  const upload: string[] = [];
  const duplicates: string[] = [];
  const firstInBatch = new Map<string, string>();
  for (const h of valid) {
    const dupOf = known.get(h.sha256) ?? firstInBatch.get(h.sha256);
    if (dupOf) {
      duplicates.push(h.id);
      await db.from("import_items").update({ status: "duplicate", sha256: h.sha256, duplicate_of: dupOf, updated_at: new Date().toISOString() }).eq("id", h.id).eq("job_id", jobId).eq("status", "waiting_upload");
    } else {
      firstInBatch.set(h.sha256, h.id);
      upload.push(h.id);
      await db.from("import_items").update({ sha256: h.sha256 }).eq("id", h.id).eq("job_id", jobId);
    }
  }
  return { upload, duplicates };
}

/** The browser finished uploading these files: queue them for reading. */
export async function markUploaded(db: Db, ws: string, jobId: string, ids: string[]) {
  for (const part of chunks(ids, 200)) {
    // The storage path is fixed by the item id, so a browser can't point an item at someone else's file.
    const { data } = await db.from("import_items").select("id, kind").eq("job_id", jobId).eq("status", "waiting_upload").in("id", part);
    await Promise.all(
      (data ?? []).map((r) =>
        db.from("import_items").update({ status: "queued", file_path: `${ws}/${r.id}.${r.kind}`, updated_at: new Date().toISOString() }).eq("id", r.id),
      ),
    );
  }
  await db.from("import_jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "uploading");
}

export async function markUploadFailed(db: Db, jobId: string, items: { id: string; error: string }[]) {
  for (const it of items) {
    await db.from("import_items").update({ status: "failed", error: String(it.error).slice(0, 300) }).eq("id", it.id).eq("job_id", jobId).eq("status", "waiting_upload");
  }
}

/** The browser is done with the upload: anything it never sent is dropped, and the job moves on. */
export async function uploadFinished(db: Db, jobId: string) {
  await db.from("import_items").update({ status: "failed", error: "The upload stopped before this file was sent." }).eq("job_id", jobId).eq("status", "waiting_upload");
  await db.from("import_jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "uploading");
  await finalizeJob(db, jobId);
}

// ---------------------------------------------------------------------------
// Review actions
// ---------------------------------------------------------------------------

interface ReadyRow {
  id: string;
  workspace_id: string;
  file_name: string;
  file_path: string | null;
  sha256: string | null;
  extraction: Extraction;
  notice_deadline: string | null;
  model: string | null;
  demo: boolean;
  department_id: string | null;
}

/** Adds reviewed files to Contracts (and as suggested tools in their department). */
export async function addItems(db: Db, session: SessionLike, jobId: string, scope: { ids?: string[]; clean?: boolean }) {
  const ws = session.workspace.id;
  const { count } = await db.from("contracts").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("demo", false);
  let total = count ?? 0;
  const blocked = await limitReasonAdmin(ws, "contracts", total);
  if (blocked) return { added: 0, error: blocked };
  const max = isBillingConfigured() ? summarize(await getBillingRowAdmin(ws)).limits.contracts : null;

  let added = 0;
  let limitHit: string | null = null;
  // Page through ready items; each pass removes what it added, so always read from the start.
  for (let guard = 0; guard < 200; guard++) {
    let q = db
      .from("import_items")
      .select("id, workspace_id, file_name, file_path, sha256, extraction, notice_deadline, model, demo, department_id")
      .eq("job_id", jobId)
      .eq("status", "ready");
    if (scope.ids) q = q.in("id", scope.ids.slice(0, 1000));
    if (scope.clean) q = q.eq("flags", "{}");
    const { data, error } = await q.order("created_at").limit(200);
    if (error) throw new Error(error.message);
    let rows = (data ?? []) as ReadyRow[];
    if (!rows.length) break;
    if (max != null) {
      const room = Math.max(0, max - total);
      if (rows.length > room) {
        rows = rows.slice(0, room);
        limitHit = await limitReasonAdmin(ws, "contracts", max);
      }
      if (!rows.length) break;
    }

    const contracts = rows.map((r) => ({
      id: r.id,
      workspace_id: ws,
      uploaded_by: session.userId,
      uploaded_by_email: session.email,
      file_name: r.file_name,
      file_path: r.file_path,
      file_hash: r.sha256,
      extraction: r.extraction,
      model: r.model,
      demo: r.demo,
      source: "import",
      ...extractionColumns(r.extraction, r.notice_deadline),
    }));
    const { error: insErr } = await db.from("contracts").upsert(contracts, { onConflict: "id", ignoreDuplicates: true });
    if (insErr) throw new Error(`Could not save the contracts: ${insErr.message}`);
    await db.from("tools").upsert(
      rows.map((r) => ({
        workspace_id: ws,
        contract_id: r.id,
        department_id: r.department_id,
        name: r.extraction.vendor.slice(0, 120) || "Unknown vendor",
        category: guessCategory(`${r.extraction.vendor} ${r.extraction.agreement_name ?? ""}`),
        annual_cost: r.extraction.annual_fee.value != null && r.extraction.annual_fee.value >= 0 ? r.extraction.annual_fee.value : null,
        seats: r.extraction.seats.value != null && r.extraction.seats.value >= 0 ? r.extraction.seats.value : null,
        renewal_date: extractionColumns(r.extraction, null).term_end,
        source: "upload",
        confirmed: false,
        created_by: session.userId,
      })),
      { onConflict: "contract_id", ignoreDuplicates: true },
    );
    const ids = rows.map((r) => r.id);
    // An added item's contract has the item's own id.
    for (const part of chunks(ids, 200)) await db.from("import_items").update({ status: "added", updated_at: new Date().toISOString() }).in("id", part);
    added += rows.length;
    total += rows.length;
    if (limitHit) break;
  }
  await finalizeJob(db, jobId);
  return { added, error: limitHit };
}

/** Leaves files out of Contracts and deletes their stored copies. */
export async function skipItems(db: Db, jobId: string, ids: string[]) {
  for (const part of chunks(ids.slice(0, 5000), 200)) {
    const { data } = await db.from("import_items").select("id, file_path").eq("job_id", jobId).in("status", ["ready", "failed", "queued", "waiting_upload"]).in("id", part);
    const paths = (data ?? []).map((r) => r.file_path).filter(Boolean) as string[];
    if (paths.length) await db.storage.from(CONTRACTS_BUCKET).remove(paths);
    await db.from("import_items").update({ status: "skipped", file_path: null, updated_at: new Date().toISOString() }).in("id", (data ?? []).map((r) => r.id));
  }
  await finalizeJob(db, jobId);
}

/** Reads failed files again. Files that never reached storage can only be retried by uploading them again. */
export async function retryItems(db: Db, jobId: string) {
  const { data } = await db
    .from("import_items")
    .update({ status: "queued", attempts: 0, error: null, not_before: null, locked_at: null, updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "failed")
    .or("file_path.not.is.null,remote_id.not.is.null")
    .select("id");
  if (data?.length) await db.from("import_jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", jobId).in("status", ["review", "done"]);
  return data?.length ?? 0;
}

/** Stops reading: files not read yet are skipped. Results already read stay for review. */
export async function cancelJob(db: Db, jobId: string) {
  const { data } = await db.from("import_items").select("id, file_path").eq("job_id", jobId).in("status", ["waiting_upload", "queued"]);
  const paths = (data ?? []).map((r) => r.file_path).filter(Boolean) as string[];
  for (const part of chunks(paths, 200)) await db.storage.from(CONTRACTS_BUCKET).remove(part);
  await db.from("import_items").update({ status: "skipped", file_path: null }).eq("job_id", jobId).in("status", ["waiting_upload", "queued"]);
  const { counts } = await jobCounts(db, jobId);
  await db
    .from("import_jobs")
    .update({ status: counts.ready || counts.processing ? "review" : "cancelled", updated_at: new Date().toISOString() })
    .eq("id", jobId);
}
