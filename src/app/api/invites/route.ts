import { NextResponse } from "next/server";
import { limitReason } from "@/lib/server/billing";
import { denyViewer, requireSession } from "@/lib/server/api";

export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const readOnly = denyViewer(ctx.session);
  if (readOnly) return readOnly;
  const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
  const clean = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const ws = ctx.session.workspace.id;
  const [mc, ic] = await Promise.all([
    ctx.supabase.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws),
    ctx.supabase.from("workspace_invites").select("id", { count: "exact", head: true }).eq("workspace_id", ws).neq("email", clean),
  ]);
  const overLimit = await limitReason(ws, "people", (mc.count ?? 0) + (ic.count ?? 0));
  if (overLimit) return NextResponse.json({ error: overLimit }, { status: 402 });
  const { error } = await ctx.supabase
    .from("workspace_invites")
    .upsert({ workspace_id: ctx.session.workspace.id, email: clean }, { onConflict: "workspace_id,email", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const readOnly = denyViewer(ctx.session);
  if (readOnly) return readOnly;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const { error } = await ctx.supabase.from("workspace_invites").delete().eq("id", id).eq("workspace_id", ctx.session.workspace.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
