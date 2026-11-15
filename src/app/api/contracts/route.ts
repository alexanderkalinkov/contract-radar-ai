import { NextResponse } from "next/server";
import { rowToSaved, type ContractRow } from "@/lib/saved";
import { requireSession } from "@/lib/server/api";

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { data, error } = await ctx.supabase
    .from("contracts")
    .select("id, workspace_id, file_name, file_path, uploaded_by_email, extraction, notice_deadline, model, demo, created_at")
    .eq("workspace_id", ctx.session.workspace.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contracts: (data as ContractRow[]).map(rowToSaved) });
}
