import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";
import { createDemoWorkspace, resetDemoWorkspace } from "@/lib/server/demo";
import { WORKSPACE_COOKIE } from "@/lib/server/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { op: "create" } makes (or finds) your demo workspace and switches to it. POST { op: "reset" } refills the current one. */
export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { op } = (await req.json().catch(() => ({}))) as { op?: string };
  const { session } = ctx;
  try {
    if (op === "create") {
      const { id, created } = await createDemoWorkspace(session.userId, session.email);
      const res = NextResponse.json({ ok: true, id, created });
      res.cookies.set(WORKSPACE_COOKIE, id, cookieOpts(req));
      return res;
    }
    if (op === "reset") {
      if (!session.workspace.is_demo) return NextResponse.json({ ok: false, error: "Switch to the demo workspace first. Only a demo workspace can be reset." }, { status: 400 });
      await resetDemoWorkspace(session.workspace.id, session.userId);
      return NextResponse.json({ ok: true, id: session.workspace.id });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

function cookieOpts(req: Request) {
  return { httpOnly: true, sameSite: "lax" as const, secure: new URL(req.url).protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365 };
}
