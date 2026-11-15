import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";

export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
  const clean = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const { error } = await ctx.supabase
    .from("workspace_invites")
    .upsert({ workspace_id: ctx.session.workspace.id, email: clean }, { onConflict: "workspace_id,email", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const { error } = await ctx.supabase.from("workspace_invites").delete().eq("id", id).eq("workspace_id", ctx.session.workspace.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
