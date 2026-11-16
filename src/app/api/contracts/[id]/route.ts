import { NextResponse } from "next/server";
import { CONTRACTS_BUCKET } from "@/lib/supabase/config";
import { denyViewer, requireSession } from "@/lib/server/api";
import { logAudit } from "@/lib/server/audit";
import type { Extraction } from "@/lib/extraction";
import { applyReview, isFieldKey, noticeDeadlineOf, parseCorrection, type ReviewAction } from "@/lib/review";
import { extractionColumns } from "@/lib/saved";

type Params = { params: Promise<{ id: string }> };

/** Returns a short-lived link to the original PDF. */
export async function GET(_req: Request, { params }: Params) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const { data: row, error } = await ctx.supabase.from("contracts").select("file_path, file_name, vendor").eq("id", id).single();
  if (error || !row) return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  if (!row.file_path) return NextResponse.json({ url: null });
  await logAudit(ctx.supabase, ctx.session.workspace.id, {
    action: "contract.file_opened",
    targetType: "contract",
    targetId: id,
    targetLabel: row.vendor,
    details: { file: row.file_name },
  });
  const { data: signed } = await ctx.supabase.storage.from(CONTRACTS_BUCKET).createSignedUrl(row.file_path, 300);
  return NextResponse.json({ url: signed?.signedUrl ?? null });
}

export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const readOnly = denyViewer(ctx.session);
  if (readOnly) return readOnly;
  const { id } = await params;
  const { data: row } = await ctx.supabase.from("contracts").select("file_path").eq("id", id).single();
  const { error } = await ctx.supabase.from("contracts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (row?.file_path) await ctx.supabase.storage.from(CONTRACTS_BUCKET).remove([row.file_path]);
  return NextResponse.json({ ok: true });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads a review action from the request body, or returns why it is invalid. */
function readReview(raw: unknown): ReviewAction | string {
  const r = raw as { action?: unknown; field?: unknown; fields?: unknown; value?: unknown } | null;
  if (!r || typeof r !== "object") return "review must be an object.";
  if (r.action === "confirm") {
    const fields = Array.isArray(r.fields) ? r.fields : [r.field];
    if (!fields.length || !fields.every(isFieldKey)) return "Unknown field.";
    return { action: "confirm", fields };
  }
  if (!isFieldKey(r.field)) return "Unknown field.";
  if (r.action === "reset") return { action: "reset", field: r.field };
  if (r.action === "correct") {
    const parsed = parseCorrection(r.field, r.value);
    return "error" in parsed ? parsed.error : { action: "correct", field: r.field, value: parsed.value };
  }
  return "action must be confirm, correct or reset.";
}

/**
 * Confirms or corrects extracted terms. Body: { review: { action: "confirm", fields: [...] } |
 * { action: "correct", field, value } | { action: "reset", field } }. A correction also updates the columns the
 * dashboard, reminders and calendar read (term end, notice deadline, fee, ...).
 */
async function patchReview(ctx: Exclude<Awaited<ReturnType<typeof requireSession>>, NextResponse>, id: string, raw: unknown) {
  const action = readReview(raw);
  if (typeof action === "string") return NextResponse.json({ error: action }, { status: 400 });
  const ws = ctx.session.workspace.id;
  const { data: row } = await ctx.supabase.from("contracts").select("extraction").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!row) return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  const extraction = applyReview(row.extraction as Extraction, action, ctx.session.email ?? null);
  const noticeDeadline = noticeDeadlineOf(extraction);
  const { error } = await ctx.supabase
    .from("contracts")
    .update({ extraction, ...extractionColumns(extraction, noticeDeadline) })
    .eq("id", id)
    .eq("workspace_id", ws);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: extraction, noticeDeadline });
}

/**
 * Sets which earlier document this one is compared with for price changes.
 * Body: { supersedesId: "<contract id>" | "<own id>" (compare with nothing) | null (match automatically) }.
 */
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const readOnly = denyViewer(ctx.session);
  if (readOnly) return readOnly;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { supersedesId?: unknown; review?: unknown } | null;
  if (body && "review" in body) return patchReview(ctx, id, body.review);
  const target = body?.supersedesId;
  if (!body || !("supersedesId" in body) || (target !== null && (typeof target !== "string" || !UUID.test(target)))) {
    return NextResponse.json({ error: "supersedesId must be a contract id or null." }, { status: 400 });
  }
  const ws = ctx.session.workspace.id;
  if (typeof target === "string" && target !== id) {
    const { data: other } = await ctx.supabase.from("contracts").select("id").eq("id", target).eq("workspace_id", ws).maybeSingle();
    if (!other) return NextResponse.json({ error: "That contract isn't in this workspace." }, { status: 404 });
  }
  const { error } = await ctx.supabase.from("contracts").update({ supersedes_id: target }).eq("id", id).eq("workspace_id", ws);
  if (error) {
    if (/supersedes_id/.test(error.message)) {
      return NextResponse.json({ error: "Run supabase/migrations/20261116200000_price_history.sql in the Supabase SQL editor first." }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, supersedesId: target });
}
