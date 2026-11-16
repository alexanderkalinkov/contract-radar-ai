import { NextResponse, type NextRequest } from "next/server";
import { importContext, importError } from "@/lib/server/import/context";
import { browse, driveAccessToken, findDriveConnection, isDriveProvider } from "@/lib/server/import/drives";

export const runtime = "nodejs";

/** GET /api/drives/:provider/browse?location=… → folders to pick from. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isDriveProvider(provider)) return NextResponse.json({ error: "Unknown drive." }, { status: 404 });
  const ctx = await importContext();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const conn = await findDriveConnection(ctx.db, ctx.session.workspace.id, ctx.session.userId, provider);
    if (!conn) return NextResponse.json({ error: "Connect the drive first." }, { status: 400 });
    const { token } = await driveAccessToken(ctx.db, conn.id);
    const location = (req.nextUrl.searchParams.get("location") ?? "").slice(0, 500);
    return NextResponse.json({ entries: await browse(provider, token, location) });
  } catch (e) {
    return importError(e, 502);
  }
}
