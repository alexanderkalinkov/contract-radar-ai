import { after, NextResponse, type NextRequest } from "next/server";
import { isUuid, pendingCount } from "@/lib/imports";
import { importContext, importError } from "@/lib/server/import/context";
import { getJob, ITEM_FILTERS, listItems, type ItemFilter } from "@/lib/server/import/jobs";
import { kickWorker, workerIdle, workerOrigin } from "@/lib/server/import/worker";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/imports/:id?filter=ready&page=0 → the job, its counts and one page of files. */
export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await importContext();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Import not found." }, { status: 404 });
  try {
    const job = await getJob(ctx.db, ctx.session.workspace.id, id);
    if (!job) return NextResponse.json({ error: "Import not found." }, { status: 404 });
    const f = req.nextUrl.searchParams.get("filter") as ItemFilter | null;
    const filter: ItemFilter = f && ITEM_FILTERS.includes(f) ? f : "all";
    const page = Math.max(0, Math.min(1000, Number(req.nextUrl.searchParams.get("page")) || 0));
    const { items, total } = await listItems(ctx.db, id, filter, page);
    // Someone is watching and work is waiting, but no run is going (a chain broke or a run died): start one.
    if ((job.status === "listing" || pendingCount(job.counts) - job.counts.waiting_upload > 0) && (await workerIdle(ctx.db))) {
      const origin = workerOrigin(req.nextUrl.origin);
      after(() => kickWorker(origin));
    }
    return NextResponse.json({ job, items, total, filter, page });
  } catch (e) {
    return importError(e);
  }
}
