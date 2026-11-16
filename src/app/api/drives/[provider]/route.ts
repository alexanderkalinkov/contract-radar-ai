import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { DRIVE_NAMES } from "@/lib/imports";
import { importContext, importError } from "@/lib/server/import/context";
import { driveAuthorizeUrl, driveBlocker, driveRedirectUri, findDriveConnection, isDriveProvider, revokeDrive } from "@/lib/server/import/drives";

export const runtime = "nodejs";

const DRIVE_STATE_COOKIE = "cr_drive_oauth";
type Params = { params: Promise<{ provider: string }> };

const back = (req: NextRequest, q: Record<string, string>) => {
  const u = new URL("/import", req.nextUrl.origin);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
};

/** GET /api/drives/:provider → the provider's sign-in page. */
export async function GET(req: NextRequest, { params }: Params) {
  const { provider } = await params;
  if (!isDriveProvider(provider)) return back(req, { drive_error: "Unknown drive." });
  const ctx = await importContext();
  if (ctx instanceof NextResponse) return ctx.status === 401 ? NextResponse.redirect(new URL("/login?next=/import", req.nextUrl.origin)) : back(req, { drive_error: "Bulk import needs Supabase login." });
  if (ctx.session.workspace.is_demo) return back(req, { drive_error: "This is the demo workspace: connect a drive in your own workspace." });
  const blocker = driveBlocker(provider);
  if (blocker) return back(req, { drive_error: `${DRIVE_NAMES[provider]} isn't set up yet. ${blocker}` });
  const nonce = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(driveAuthorizeUrl(provider, driveRedirectUri(provider, req.nextUrl.origin), `${provider}.${nonce}`));
  res.cookies.set(DRIVE_STATE_COOKIE, JSON.stringify({ provider, nonce, ws: ctx.session.workspace.id }), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/drives",
    maxAge: 600,
  });
  return res;
}

/** DELETE /api/drives/:provider → forget this person's sign-in. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { provider } = await params;
  if (!isDriveProvider(provider)) return NextResponse.json({ error: "Unknown drive." }, { status: 404 });
  const ctx = await importContext();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const conn = await findDriveConnection(ctx.db, ctx.session.workspace.id, ctx.session.userId, provider);
    if (conn) await revokeDrive(ctx.db, conn);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return importError(e);
  }
}
