import { after, NextResponse, type NextRequest } from "next/server";
import type { ImportSource } from "@/lib/imports";
import { importContext, importError } from "@/lib/server/import/context";
import { findDriveConnection, isDriveProvider } from "@/lib/server/import/drives";
import { createUploadJob, listJobs, type NewFile } from "@/lib/server/import/jobs";
import { kickWorker, workerOrigin } from "@/lib/server/import/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/imports → recent imports in this workspace. */
export async function GET() {
  const ctx = await importContext();
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json({ jobs: await listJobs(ctx.db, ctx.session.workspace.id) });
  } catch (e) {
    return importError(e);
  }
}

/**
 * POST /api/imports
 *   { source: "zip" | "files", name, files: [{ path, size }] } → { jobId, items: [{ id, path }], rejected }
 *   { source: "gdrive" | "onedrive", folder: { id, name } }     → { jobId }  (the server walks the folder)
 */
export async function POST(req: NextRequest) {
  const ctx = await importContext({ write: true });
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => null)) as { source?: ImportSource; name?: string; files?: NewFile[]; folder?: { id?: string; name?: string } } | null;
  const source = body?.source;
  try {
    if (source === "zip" || source === "files") {
      if (!Array.isArray(body?.files)) return NextResponse.json({ error: "No files." }, { status: 400 });
      const r = await createUploadJob(ctx.db, ctx.session, source, String(body.name ?? "Import"), body.files);
      if ("error" in r) return NextResponse.json(r, { status: 400 });
      return NextResponse.json(r);
    }
    if (source && isDriveProvider(source)) {
      if (ctx.session.workspace.is_demo) return NextResponse.json({ error: "This is the demo workspace: connect a drive in your own workspace." }, { status: 400 });
      const folderId = String(body?.folder?.id ?? "");
      if (!folderId || folderId.length > 500 || folderId.startsWith("site:")) return NextResponse.json({ error: "Pick a folder or a drive." }, { status: 400 });
      const conn = await findDriveConnection(ctx.db, ctx.session.workspace.id, ctx.session.userId, source);
      if (!conn) return NextResponse.json({ error: "Connect the drive first." }, { status: 400 });
      const { data: job, error } = await ctx.db
        .from("import_jobs")
        .insert({
          workspace_id: ctx.session.workspace.id,
          created_by: ctx.session.userId,
          created_by_email: ctx.session.email,
          source,
          name: String(body?.folder?.name ?? "Folder").slice(0, 300) || "Folder",
          status: "listing",
          remote: { connection_id: conn.id, provider: source, pending: [{ id: folderId, path: "" }], cursor: null, found: 0 },
        })
        .select("id")
        .single();
      if (error || !job) throw new Error(error?.message ?? "Could not start the import.");
      const origin = workerOrigin(req.nextUrl.origin);
      after(() => kickWorker(origin));
      return NextResponse.json({ jobId: job.id });
    }
    return NextResponse.json({ error: "Unknown source." }, { status: 400 });
  } catch (e) {
    return importError(e);
  }
}

