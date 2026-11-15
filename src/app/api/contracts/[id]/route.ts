import { NextResponse } from "next/server";
import { CONTRACTS_BUCKET } from "@/lib/supabase/config";
import { requireSession } from "@/lib/server/api";

type Params = { params: Promise<{ id: string }> };

/** Returns a short-lived link to the original PDF. */
export async function GET(_req: Request, { params }: Params) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const { data: row, error } = await ctx.supabase.from("contracts").select("file_path").eq("id", id).single();
  if (error || !row) return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  if (!row.file_path) return NextResponse.json({ url: null });
  const { data: signed } = await ctx.supabase.storage.from(CONTRACTS_BUCKET).createSignedUrl(row.file_path, 300);
  return NextResponse.json({ url: signed?.signedUrl ?? null });
}

export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const { data: row } = await ctx.supabase.from("contracts").select("file_path").eq("id", id).single();
  const { error } = await ctx.supabase.from("contracts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (row?.file_path) await ctx.supabase.storage.from(CONTRACTS_BUCKET).remove([row.file_path]);
  return NextResponse.json({ ok: true });
}
