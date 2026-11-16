import { NextResponse } from "next/server";
import { denyViewer, requireSession } from "@/lib/server/api";

export async function PATCH(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const readOnly = denyViewer(ctx.session);
  if (readOnly) return readOnly;
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; show_sample_data?: unknown };
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
  if (typeof body.show_sample_data === "boolean") patch.show_sample_data = body.show_sample_data;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  const { error } = await ctx.supabase.from("workspaces").update(patch).eq("id", ctx.session.workspace.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
