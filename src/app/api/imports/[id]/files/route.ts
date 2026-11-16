import { after, NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/imports";
import { importContext, importError } from "@/lib/server/import/context";
import { checkHashes, markUploaded, markUploadFailed, uploadFinished } from "@/lib/server/import/jobs";
import { kickWorker, workerOrigin } from "@/lib/server/import/worker";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * The browser reports upload progress for a ZIP or folder import:
 *   { action: "hash", items: [{ id, sha256 }] } → { upload: [ids], duplicates: [ids] }
 *   { action: "uploaded", ids: [...] }          → queued for reading
 *   { action: "failed", items: [{ id, error }] }
 *   { action: "finished" }                      → anything not sent is marked failed
 */
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await importContext();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const ws = ctx.session.workspace.id;
  const { data: job } = isUuid(id) ? await ctx.db.from("import_jobs").select("id, status").eq("id", id).eq("workspace_id", ws).maybeSingle() : { data: null };
  if (!job) return NextResponse.json({ error: "Import not found." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { action?: string; items?: { id: string; sha256?: string; error?: string }[]; ids?: string[] } | null;
  const ids = (body?.ids ?? []).filter(isUuid).slice(0, 1000);
  const items = (body?.items ?? []).filter((i) => isUuid(i?.id)).slice(0, 1000);
  try {
    switch (body?.action) {
      case "hash":
        return NextResponse.json(await checkHashes(ctx.db, ws, id, items.map((i) => ({ id: i.id, sha256: String(i.sha256 ?? "") }))));
      case "uploaded": {
        await markUploaded(ctx.db, ws, id, ids);
        const origin = workerOrigin(req.nextUrl.origin);
        after(() => kickWorker(origin));
        return NextResponse.json({ ok: true });
      }
      case "failed":
        await markUploadFailed(ctx.db, id, items.map((i) => ({ id: i.id, error: String(i.error ?? "Upload failed") })));
        return NextResponse.json({ ok: true });
      case "finished":
        await uploadFinished(ctx.db, id);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return importError(e);
  }
}
