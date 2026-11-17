import { after, NextResponse, type NextRequest } from "next/server";
import { recordJobRun } from "@/lib/server/platform";
import { isWorkerRequest, kickWorker, runWorker, workerOrigin } from "@/lib/server/import/worker";

// The bulk import worker. Started by the app itself (when files are queued, and by each run while work
// remains) and once a day by Vercel Cron as a safety net. It answers at once and works in the background.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function start(req: NextRequest) {
  if (!isWorkerRequest(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const origin = workerOrigin(req.nextUrl.origin);
  after(async () => {
    try {
      const r = await runWorker();
      await recordJobRun("import-worker", true, { ran: r.ran, processed: r.processed, listed: r.listed, more: r.more });
      if (r.ran && r.more) await kickWorker(origin);
    } catch (e) {
      console.error("import worker failed", e);
      await recordJobRun("import-worker", false, {}, (e as Error).message);
    }
  });
  return NextResponse.json({ started: true }, { status: 202 });
}

export const POST = start;
export const GET = start; // Vercel Cron sends GET with "Authorization: Bearer $CRON_SECRET"
