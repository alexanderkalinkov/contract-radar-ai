import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";
import { WORKSPACE_COOKIE } from "@/lib/server/workspace";

/** POST { id } → work in that workspace from now on (you must be a member). */
export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  const target = ctx.session.workspaces.find((w) => w.id === id);
  if (!target) return NextResponse.json({ ok: false, error: "You're not a member of that workspace." }, { status: 404 });
  const res = NextResponse.json({ ok: true, id: target.id, name: target.name });
  res.cookies.set(WORKSPACE_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
