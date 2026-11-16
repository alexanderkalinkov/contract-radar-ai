import { NextResponse } from "next/server";
import { DRIVE_NAMES, type DriveProvider } from "@/lib/imports";
import { importContext, importError } from "@/lib/server/import/context";
import { driveBlocker, findDriveConnection } from "@/lib/server/import/drives";

export const runtime = "nodejs";

/** GET /api/drives → for each drive: can it be connected on this server, and is the person connected. */
export async function GET() {
  const ctx = await importContext();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const drives = await Promise.all(
      (Object.keys(DRIVE_NAMES) as DriveProvider[]).map(async (p) => {
        const conn = await findDriveConnection(ctx.db, ctx.session.workspace.id, ctx.session.userId, p);
        return { provider: p, name: DRIVE_NAMES[p], blocker: driveBlocker(p), connected: Boolean(conn), account: conn?.account_email ?? null };
      }),
    );
    return NextResponse.json({ drives, demoWorkspace: Boolean(ctx.session.workspace.is_demo) });
  } catch (e) {
    return importError(e);
  }
}
