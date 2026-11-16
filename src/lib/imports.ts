// Bulk import: shared between the browser and the server. See docs/bulk-import.md.
import type { Extraction } from "./extraction";

export type ImportSource = "zip" | "files" | "gdrive" | "onedrive";
export type DriveProvider = "gdrive" | "onedrive";
export type JobStatus = "uploading" | "listing" | "running" | "review" | "done" | "cancelled" | "failed";
export type ItemStatus = "waiting_upload" | "queued" | "processing" | "ready" | "duplicate" | "failed" | "added" | "skipped";
export type ItemFlag = "low_confidence" | "possible_duplicate" | "not_a_contract";
export type FileKind = "pdf" | "docx";

export const ITEM_STATUSES: ItemStatus[] = ["waiting_upload", "queued", "processing", "ready", "duplicate", "failed", "added", "skipped"];

/** Most files one import may hold. */
export const MAX_IMPORT_FILES = 5000;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const DRIVE_NAMES: Record<DriveProvider, string> = { gdrive: "Google Drive", onedrive: "SharePoint / OneDrive" };
export const SOURCE_NAMES: Record<ImportSource, string> = { zip: "ZIP file", files: "Folder upload", ...DRIVE_NAMES };

export const FLAG_LABELS: Record<ItemFlag, string> = {
  low_confidence: "Check the dates or fee",
  possible_duplicate: "Looks like a contract you already have",
  not_a_contract: "May not be a contract",
};

export type Counts = Record<ItemStatus, number>;

export interface JobSummary {
  id: string;
  name: string;
  source: ImportSource;
  status: JobStatus;
  error: string | null;
  created_at: string;
  created_by_email: string | null;
  counts: Counts;
  /** Ready items with no flags: what "Add all clean" would add. */
  clean: number;
}

export interface ItemView {
  id: string;
  file_name: string;
  folder: string | null;
  kind: FileKind;
  size: number | null;
  status: ItemStatus;
  error: string | null;
  flags: ItemFlag[];
  vendor: string | null;
  term_end: string | null;
  annual_fee: number | null;
  currency: string | null;
  notice_deadline: string | null;
  demo: boolean;
  model: string | null;
  duplicate_of: string | null;
  department_id: string | null;
  extraction: Extraction | null;
}

export const emptyCounts = (): Counts => Object.fromEntries(ITEM_STATUSES.map((s) => [s, 0])) as Counts;

/** Files still on their way through the pipeline. */
export const pendingCount = (c: Counts) => c.waiting_upload + c.queued + c.processing;
export const totalCount = (c: Counts) => ITEM_STATUSES.reduce((n, s) => n + c[s], 0);

/** pdf / docx from a file name (and MIME type, when known). Everything else is ignored. */
export function fileKind(name: string, mime?: string | null): FileKind | null {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (n.endsWith(".docx") || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return null;
}

/** Mac and Windows clutter inside ZIPs and folders: resource forks, hidden files, temp files. */
export function isJunkPath(path: string): boolean {
  const parts = path.split("/");
  const base = parts[parts.length - 1] ?? "";
  return parts.some((p) => p === "__MACOSX" || (p.startsWith(".") && p.length > 1)) || base.startsWith("~$") || base === "";
}

/** "a/b/c.pdf" → { folder: "a/b", name: "c.pdf" } */
export function splitPath(path: string): { folder: string | null; name: string } {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const i = clean.lastIndexOf("/");
  return i < 0 ? { folder: null, name: clean } : { folder: clean.slice(0, i), name: clean.slice(i + 1) };
}

/**
 * Files filed in a folder named like a department (e.g. "Marketing/hubspot.pdf" or "FanDuel/Marketing/…") land in
 * that department. The deepest matching folder wins, so brand/department layouts work.
 */
export function departmentFor(folder: string | null, departments: { id: string; name: string }[]): string | null {
  if (!folder || !departments.length) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const byName = new Map(departments.map((d) => [norm(d.name), d.id]));
  const parts = folder.split("/").map(norm).reverse();
  for (const p of parts) {
    const hit = byName.get(p);
    if (hit) return hit;
  }
  return null;
}

/** Flags shown on the review screen for a freshly read file. Duplicate matching happens on the server. */
export function extractionFlags(d: Extraction): ItemFlag[] {
  const flags: ItemFlag[] = [];
  if (d.document_kind === "invoice" || d.document_kind === "other") flags.push("not_a_contract");
  const weak = (f: { value: unknown; confidence: string }) => f.value == null || f.confidence === "low";
  if (weak(d.term_end) || (d.annual_fee.value != null && d.annual_fee.confidence === "low")) flags.push("low_confidence");
  return flags;
}

export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
