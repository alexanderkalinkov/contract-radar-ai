import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIME } from "@/lib/inbound";
import { departmentFor, extractionFlags, MAX_FILE_BYTES, MAX_IMPORT_FILES, type DriveProvider, type ItemFlag } from "@/lib/imports";
import { extractionColumns } from "@/lib/saved";
import { CONTRACTS_BUCKET } from "@/lib/supabase/config";
import { adminClient } from "../admin";
import { docxToText, extractContract, isExtractError, isPdf, isZip } from "../extract";
import { downloadFile, driveAccessToken, listPage } from "./drives";

// The background worker for bulk imports. One run lasts at most a few minutes (Vercel function limit),
// reads files a few at a time with Claude, and starts the next run itself while work remains.
// A daily cron also starts a run, in case a chain ever breaks. See docs/bulk-import.md.
//
//   IMPORT_CONCURRENCY   files read at the same time (default 3). Lower it if Claude rate limits you.
//   IMPORT_WORKER_SECRET optional; by default the secret is derived from the Supabase service key.

type Db = SupabaseClient;

// Stop taking new files after this. The route allows 300 s and one file can take up to ~2 minutes.
const RUN_BUDGET_MS = 170_000;
const LEASE_SECONDS = 330;
const MAX_ATTEMPTS = 3;
const LIST_BUDGET_MS = 40_000;

const concurrency = () => Math.min(8, Math.max(1, Number(process.env.IMPORT_CONCURRENCY) || 3));

// ---------------------------------------------------------------------------
// Starting runs
// ---------------------------------------------------------------------------

export function workerSecret(): string | null {
  const explicit = process.env.IMPORT_WORKER_SECRET?.trim();
  if (explicit) return explicit;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return key ? createHmac("sha256", key).update("contract-radar-import-worker").digest("hex") : null;
}

export function isWorkerRequest(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const candidates = [workerSecret(), process.env.CRON_SECRET?.trim()].filter(Boolean) as string[];
  const got = Buffer.from(auth.replace(/^Bearer /, ""));
  return candidates.some((c) => {
    const want = Buffer.from(c);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

export function workerOrigin(requestOrigin: string) {
  return process.env.APP_URL?.trim().replace(/\/$/, "") || requestOrigin;
}

/** Asks the worker route to start a run. Returns quickly: the route answers before it works. */
export async function kickWorker(origin: string): Promise<void> {
  const secret = workerSecret();
  if (!secret) return;
  try {
    await fetch(`${origin}/api/imports/worker`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error("could not start the import worker", e);
  }
}

/** True when no run holds the lease, so a kick would start one. */
export async function workerIdle(db: Db): Promise<boolean> {
  const { data } = await db.from("import_worker").select("lease_until").eq("id", 1).maybeSingle();
  return !data?.lease_until || Date.parse(data.lease_until) < Date.now();
}

// ---------------------------------------------------------------------------
// A run
// ---------------------------------------------------------------------------

interface ItemRow {
  id: string;
  job_id: string;
  workspace_id: string;
  file_name: string;
  folder: string | null;
  kind: "pdf" | "docx";
  remote_id: string | null;
  file_path: string | null;
  sha256: string | null;
  attempts: number;
  created_at: string;
}

interface JobRow {
  id: string;
  workspace_id: string;
  source: string;
  status: string;
  remote: { connection_id: string; provider: DriveProvider; pending: { id: string; path: string }[]; cursor?: string | null; found?: number } | null;
}

export interface RunReport {
  ran: boolean;
  processed: number;
  listed: number;
  more: boolean;
}

export async function runWorker(): Promise<RunReport> {
  const db = adminClient();
  if (!db) return { ran: false, processed: 0, listed: 0, more: false };
  const runId = randomUUID();
  const start = Date.now();
  const { data: got, error } = await db.rpc("import_take_lease", { p_run: runId, p_seconds: LEASE_SECONDS });
  if (error) throw new Error(error.message);
  if (!got) return { ran: false, processed: 0, listed: 0, more: false };

  let processed = 0;
  let listed = 0;
  const touched = new Set<string>();
  const jobs = new Map<string, JobRow | null>();
  const job = async (id: string) => {
    if (!jobs.has(id)) {
      const { data } = await db.from("import_jobs").select("id, workspace_id, source, status, remote").eq("id", id).maybeSingle();
      jobs.set(id, (data as JobRow | null) ?? null);
    }
    return jobs.get(id) ?? null;
  };

  try {
    // 1. Walk cloud folders that are still being listed.
    const { data: listing } = await db.from("import_jobs").select("id, workspace_id, source, status, remote").eq("status", "listing").order("created_at").limit(5);
    for (const j of (listing ?? []) as JobRow[]) {
      if (Date.now() - start > RUN_BUDGET_MS / 2) break;
      listed += await listStep(db, j, Date.now() + LIST_BUDGET_MS).catch(async (e) => {
        await db.from("import_jobs").update({ status: "failed", error: (e as Error).message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", j.id);
        return 0;
      });
      touched.add(j.id);
    }

    // 2. Read files, a few at a time.
    const lane = async () => {
      while (Date.now() - start < RUN_BUDGET_MS) {
        const { data: claimed, error: claimError } = await db.rpc("import_claim_items", { p_limit: 1 });
        if (claimError) throw new Error(claimError.message);
        const item = (claimed as ItemRow[] | null)?.[0];
        if (!item) {
          // Only files waiting out a rate-limit backoff left? Wait for the soonest one if it fits in this run.
          const wait = await soonestBackoff(db);
          if (wait != null && Date.now() - start + wait < RUN_BUDGET_MS) {
            await new Promise((r) => setTimeout(r, Math.max(1000, wait)));
            continue;
          }
          return;
        }
        touched.add(item.job_id);
        const j = await job(item.job_id);
        await processItem(db, item, j).catch((e) => fail(db, item, (e as Error).message));
        processed += 1;
        await db.rpc("import_take_lease", { p_run: runId, p_seconds: LEASE_SECONDS });
      }
    };
    await Promise.all(Array.from({ length: concurrency() }, lane));

    for (const id of touched) await finalizeJob(db, id);
  } finally {
    await db.rpc("import_release_lease", { p_run: runId });
  }
  return { ran: true, processed, listed, more: await hasWork(db) };
}

async function soonestBackoff(db: Db): Promise<number | null> {
  const { data } = await db.from("import_items").select("not_before").eq("status", "queued").not("not_before", "is", null).order("not_before").limit(1);
  const nb = data?.[0]?.not_before as string | undefined;
  return nb ? Date.parse(nb) - Date.now() : null;
}

export async function hasWork(db: Db): Promise<boolean> {
  const [{ count: queued }, { count: listing }, { count: stale }] = await Promise.all([
    db.from("import_items").select("id", { count: "exact", head: true }).eq("status", "queued"),
    db.from("import_jobs").select("id", { count: "exact", head: true }).eq("status", "listing"),
    db
      .from("import_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing")
      .lt("locked_at", new Date(Date.now() - 10 * 60_000).toISOString()),
  ]);
  return Boolean((queued ?? 0) + (listing ?? 0) + (stale ?? 0));
}

/** Moves a job on once nothing is left in flight: to review when results wait, otherwise done. */
export async function finalizeJob(db: Db, jobId: string) {
  const { data: j } = await db.from("import_jobs").select("status").eq("id", jobId).maybeSingle();
  if (!j || !["running", "review"].includes(j.status)) return;
  const count = async (statuses: string[]) =>
    (await db.from("import_items").select("id", { count: "exact", head: true }).eq("job_id", jobId).in("status", statuses)).count ?? 0;
  const inFlight = await count(["waiting_upload", "queued", "processing"]);
  if (inFlight) {
    if (j.status !== "running") await db.from("import_jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", jobId);
    return;
  }
  const status = (await count(["ready", "failed"])) ? "review" : "done";
  if (status !== j.status) await db.from("import_jobs").update({ status, updated_at: new Date().toISOString() }).eq("id", jobId);
}

// ---------------------------------------------------------------------------
// One file
// ---------------------------------------------------------------------------

async function fail(db: Db, item: ItemRow, message: string) {
  await db.from("import_items").update({ status: "failed", error: message.slice(0, 500), locked_at: null, updated_at: new Date().toISOString() }).eq("id", item.id);
}

async function retryLater(db: Db, item: ItemRow, message: string, delayMs: number, countAttempt: boolean) {
  if (countAttempt && item.attempts >= MAX_ATTEMPTS) return fail(db, item, message);
  await db
    .from("import_items")
    .update({
      status: "queued",
      error: message.slice(0, 500),
      not_before: new Date(Date.now() + delayMs).toISOString(),
      attempts: countAttempt ? item.attempts : Math.max(0, item.attempts - 1),
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);
}

const ownPath = (item: ItemRow) => `${item.workspace_id}/${item.id}.${item.kind}`;

async function processItem(db: Db, item: ItemRow, job: JobRow | null) {
  if (!job || job.status === "cancelled") {
    await db.from("import_items").update({ status: "skipped", locked_at: null }).eq("id", item.id);
    return;
  }
  if (item.attempts > MAX_ATTEMPTS + 2) return fail(db, item, "Gave up after several tries (the file may be too slow to read).");

  // 1. Get the bytes: from our storage (ZIP and folder uploads), or from the drive (then keep a copy).
  let bytes: Buffer;
  let filePath = item.file_path;
  if (filePath) {
    const { data: blob, error } = await db.storage.from(CONTRACTS_BUCKET).download(filePath);
    if (error || !blob) return fail(db, item, "The uploaded file is missing from storage. Upload it again.");
    bytes = Buffer.from(await blob.arrayBuffer());
  } else if (item.remote_id && job.remote) {
    try {
      const { token, provider } = await driveAccessToken(db, job.remote.connection_id);
      bytes = await downloadFile(provider, token, item.remote_id);
    } catch (e) {
      return retryLater(db, item, (e as Error).message, 30_000 * item.attempts, true);
    }
  } else {
    return fail(db, item, "Nothing to read: the file never arrived.");
  }
  if (bytes.length > MAX_FILE_BYTES) return fail(db, item, "Larger than 20 MB.");

  // 2. Same file already in this workspace? Then don't pay to read it again.
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const dup = await findDuplicateFile(db, item, sha256);
  if (dup) {
    if (filePath === ownPath(item)) await db.storage.from(CONTRACTS_BUCKET).remove([filePath]);
    await db
      .from("import_items")
      .update({ status: "duplicate", sha256, duplicate_of: dup, file_path: null, locked_at: null, error: null, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    return;
  }

  // 3. Turn it into something Claude can read.
  let input: Parameters<typeof extractContract>[1];
  if (item.kind === "pdf") {
    if (!isPdf(bytes)) return fail(db, item, "This file isn't a real PDF.");
    input = { kind: "pdf", bytes };
  } else {
    const text = isZip(bytes) ? await docxToText(bytes) : null;
    if (!text) return fail(db, item, "Couldn't read any text from this Word file.");
    input = { kind: "text", text };
  }

  if (!filePath) {
    filePath = ownPath(item);
    const up = await db.storage.from(CONTRACTS_BUCKET).upload(filePath, bytes, { contentType: MIME[item.kind], upsert: true });
    if (up.error) filePath = null; // still read it; the contract just won't have the original attached
  }

  // 4. Claude reads it (the same two-request pipeline as a single upload).
  const result = await extractContract(item.file_name, input);
  if (isExtractError(result)) {
    if (result.status === 429) return retryLater(db, item, result.error, 60_000, false);
    if (result.status >= 500) return retryLater(db, item, result.error, 20_000 * item.attempts, true);
    return fail(db, item, result.error);
  }

  const cols = extractionColumns(result.data, result.noticeDeadline);
  const flags: ItemFlag[] = extractionFlags(result.data);
  if (await looksLikeKnownContract(db, item, cols)) flags.push("possible_duplicate");
  await db
    .from("import_items")
    .update({
      status: "ready",
      sha256,
      file_path: filePath,
      extraction: result.data,
      vendor: cols.vendor,
      term_end: cols.term_end,
      annual_fee: cols.annual_fee,
      currency: cols.currency,
      notice_deadline: result.noticeDeadline,
      model: result.model ?? null,
      demo: result.demo,
      flags,
      error: null,
      locked_at: null,
      not_before: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);
}

/** A contract, or an earlier file of any import, with exactly these bytes. Returns its id. */
async function findDuplicateFile(db: Db, item: ItemRow, sha256: string): Promise<string | null> {
  const { data: c } = await db.from("contracts").select("id").eq("workspace_id", item.workspace_id).eq("file_hash", sha256).limit(1);
  if (c?.[0]) return c[0].id;
  const { data: i } = await db
    .from("import_items")
    .select("id")
    .eq("workspace_id", item.workspace_id)
    .eq("sha256", sha256)
    .neq("id", item.id)
    .in("status", ["queued", "processing", "ready", "added"])
    .lt("created_at", item.created_at)
    .limit(1);
  return i?.[0]?.id ?? null;
}

/** Same vendor, same term end and same fee as a contract we already have (or another file waiting for review). */
async function looksLikeKnownContract(db: Db, item: ItemRow, cols: ReturnType<typeof extractionColumns>): Promise<boolean> {
  if (!cols.term_end || !cols.vendor) return false;
  const vendor = cols.vendor.replace(/([\\%_])/g, "\\$1");
  for (const table of ["contracts", "import_items"] as const) {
    let q = db.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", item.workspace_id).ilike("vendor", vendor).eq("term_end", cols.term_end);
    q = cols.annual_fee == null ? q.is("annual_fee", null) : q.eq("annual_fee", cols.annual_fee);
    if (table === "import_items") q = q.eq("status", "ready").neq("id", item.id);
    const { count } = await q;
    if (count) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Listing a cloud folder
// ---------------------------------------------------------------------------

/** Walks part of a cloud folder tree and queues the files found. Returns how many files were queued. */
async function listStep(db: Db, job: JobRow, until: number): Promise<number> {
  const r = job.remote;
  if (!r) throw new Error("This import has no folder to read.");
  const { token, provider } = await driveAccessToken(db, r.connection_id);
  const { data: depts } = await db.from("departments").select("id, name").eq("workspace_id", job.workspace_id);
  let found = r.found ?? 0;
  let added = 0;
  const pending = [...r.pending];
  let cursor = r.cursor ?? null;

  while (pending.length && Date.now() < until && found < MAX_IMPORT_FILES) {
    const here = pending[0];
    const page = await listPage(provider, token, here.id, cursor);
    for (const f of page.folders) pending.push({ id: f.id, path: here.path ? `${here.path}/${f.name}` : f.name });
    const rows = page.files
      .filter((f) => f.size == null || f.size <= MAX_FILE_BYTES)
      .slice(0, MAX_IMPORT_FILES - found)
      .map((f) => ({
        job_id: job.id,
        workspace_id: job.workspace_id,
        file_name: f.name.slice(0, 250),
        folder: here.path || null,
        kind: f.kind,
        size: f.size,
        remote_id: f.remoteId,
        status: "queued",
        department_id: departmentFor(here.path || null, depts ?? []),
      }));
    if (rows.length) {
      const { error } = await db.from("import_items").insert(rows);
      if (error) throw new Error(error.message);
      found += rows.length;
      added += rows.length;
    }
    if (page.next) cursor = page.next;
    else {
      pending.shift();
      cursor = null;
    }
  }

  const done = !pending.length || found >= MAX_IMPORT_FILES;
  await db
    .from("import_jobs")
    .update({
      status: done ? (found ? "running" : "done") : "listing",
      error: done && !found ? "No PDF or Word files in this folder." : found >= MAX_IMPORT_FILES ? `Stopped at ${MAX_IMPORT_FILES} files. Import sub-folders separately for the rest.` : null,
      remote: { ...r, pending, cursor, found },
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return added;
}
