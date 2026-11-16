import { after, NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/imports";
import { importContext, importError } from "@/lib/server/import/context";
import { addItems, cancelJob, retryItems, skipItems } from "@/lib/server/import/jobs";
import { kickWorker, workerOrigin } from "@/lib/server/import/worker";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/**
 * Review actions:
 *   { action: "add", ids } · { action: "add", clean: true } (every ready file with nothing to check)
 *   { action: "skip", ids } · { action: "retry" } (failed files) · { action: "cancel" }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await importContext();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const { data: job } = isUuid(id) ? await ctx.db.from("import_jobs").select("id").eq("id", id).eq("workspace_id", ctx.session.workspace.id).maybeSingle() : { data: null };
  if (!job) return NextResponse.json({ error: "Import not found." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { action?: string; ids?: unknown[]; clean?: boolean } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter(isUuid) : undefined;
  try {
    switch (body?.action) {
      case "add": {
        if (!body.clean && !ids?.length) return NextResponse.json({ error: "Pick files to add." }, { status: 400 });
        const r = await addItems(ctx.db, ctx.session, id, body.clean ? { clean: true, ids } : { ids });
        return NextResponse.json(r, { status: r.added || !r.error ? 200 : 402 });
      }
      case "skip":
        if (!ids?.length) return NextResponse.json({ error: "Pick files to skip." }, { status: 400 });
        await skipItems(ctx.db, id, ids);
        return NextResponse.json({ ok: true });
      case "retry": {
        const n = await retryItems(ctx.db, id);
        const origin = workerOrigin(req.nextUrl.origin);
        if (n) after(() => kickWorker(origin));
        return NextResponse.json({ retried: n });
      }
      case "cancel":
        await cancelJob(ctx.db, id);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return importError(e);
  }
}
