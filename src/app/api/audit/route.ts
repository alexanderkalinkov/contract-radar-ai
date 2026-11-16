import { NextResponse } from "next/server";
import { canApproveRenewals } from "@/lib/roles";
import { requireSession } from "@/lib/server/api";
import { logAudit } from "@/lib/server/audit";
import { describeAction, type AuditEntry } from "@/lib/enterprise/types";

const MIGRATION = "Run supabase/migrations/20261116230000_audit_entities_sso.sql in the Supabase SQL editor to turn on the audit log.";

/**
 * GET /api/audit?type=contract&before=<id>&limit=100 → { entries, next }
 * GET /api/audit?format=csv&days=90 → CSV download (logged as audit.exported)
 */
export async function GET(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  if (!canApproveRenewals(ctx.session.role)) {
    return NextResponse.json({ error: "Only admins and approvers can see the audit log." }, { status: 403 });
  }
  const url = new URL(req.url);
  const ws = ctx.session.workspace.id;
  const csv = url.searchParams.get("format") === "csv";
  const type = url.searchParams.get("type");
  const before = Number(url.searchParams.get("before"));
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 90, 1), 3650);
  const limit = csv ? 10000 : Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);

  let q = ctx.supabase
    .from("audit_log")
    .select("id, actor_email, action, target_type, target_id, target_label, details, created_at")
    .eq("workspace_id", ws)
    .order("id", { ascending: false })
    .limit(limit);
  if (type && /^[a-z_]+$/.test(type)) q = q.eq("target_type", type);
  if (Number.isFinite(before) && before > 0) q = q.lt("id", before);
  if (csv) q = q.gte("created_at", new Date(Date.now() - days * 86400000).toISOString());
  const { data, error } = await q;
  if (error) {
    const missing = /relation .* does not exist|Could not find the table|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? MIGRATION : error.message }, { status: 500 });
  }
  const entries = (data ?? []) as AuditEntry[];

  if (csv) {
    await logAudit(ctx.supabase, ws, { action: "audit.exported", targetType: "workspace", targetId: ws, details: { days, rows: entries.length } });
    const cell = (v: unknown) => {
      const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
      // Quote everything, and stop spreadsheet formula injection.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const rows = [
      ["time_utc", "actor", "action", "description", "target_type", "target_id", "target", "details"],
      ...entries.map((e) => [e.created_at, e.actor_email, e.action, describeAction(e.action), e.target_type, e.target_id, e.target_label, e.details]),
    ];
    const body = rows.map((r) => r.map(cell).join(",")).join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="contract-radar-audit-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  return NextResponse.json({ entries, next: entries.length === limit ? entries[entries.length - 1].id : null });
}
