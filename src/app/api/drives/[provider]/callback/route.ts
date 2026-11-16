import { NextResponse, type NextRequest } from "next/server";
import { DRIVE_NAMES } from "@/lib/imports";
import { importContext } from "@/lib/server/import/context";
import { driveRedirectUri, exchangeDriveCode, isDriveProvider, saveDriveConnection } from "@/lib/server/import/drives";

export const runtime = "nodejs";

const COOKIE = "cr_drive_oauth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const q = req.nextUrl.searchParams;
  let saved: { provider?: string; nonce?: string; ws?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(COOKIE)?.value ?? "{}");
  } catch {
    // ignore
  }
  const done = (query: Record<string, string>) => {
    const u = new URL("/import", req.nextUrl.origin);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    const res = NextResponse.redirect(u);
    res.cookies.set(COOKIE, "", { path: "/api/drives", maxAge: 0 });
    return res;
  };
  if (!isDriveProvider(provider)) return done({ drive_error: "Unknown drive." });
  const name = DRIVE_NAMES[provider];
  if (q.get("error")) return done({ drive_error: `${name} sign-in was cancelled (${q.get("error_description") ?? q.get("error")}).` });
  if (!saved.nonce || saved.provider !== provider || q.get("state") !== `${provider}.${saved.nonce}`) {
    return done({ drive_error: `The ${name} sign-in link expired or came from another browser. Try again.` });
  }
  const code = q.get("code");
  if (!code) return done({ drive_error: `${name} didn't return a sign-in code. Try again.` });
  const ctx = await importContext();
  if (ctx instanceof NextResponse) return done({ drive_error: "Your Contract Radar session ended. Sign in and try again." });
  if (ctx.session.workspace.id !== saved.ws) return done({ drive_error: "You switched workspace while signing in. Try again." });
  try {
    const tokens = await exchangeDriveCode(provider, code, driveRedirectUri(provider, req.nextUrl.origin));
    await saveDriveConnection(ctx.db, ctx.session.workspace.id, ctx.session.userId, provider, tokens);
    return done({ drive_connected: provider });
  } catch (e) {
    return done({ drive_error: (e as Error).message });
  }
}
