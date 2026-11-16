import { NextResponse } from "next/server";
import { toISO } from "@/lib/engine";
import { alertDays, brand } from "@/lib/email/brand";
import { sampleAlertItems } from "@/lib/email/samples";
import { renewalAlertEmail } from "@/lib/email/templates";
import { requireSession } from "@/lib/server/api";
import { isEmailConfigured, sendEmail } from "@/lib/server/mailer";

const needsMigration = (msg: string) =>
  /renewal_alerts/.test(msg) ? "Run supabase/migrations/20261116120000_renewal_alerts.sql in the Supabase SQL editor first." : msg;

/** Reminder settings and the last reminders sent, for Workspace settings. */
export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const ws = ctx.session.workspace.id;
  const [w, log] = await Promise.all([
    ctx.supabase.from("workspaces").select("renewal_alerts").eq("id", ws).single(),
    ctx.supabase
      .from("renewal_alerts")
      .select("contract_id, kind, event_date, days_before, recipient, sent_at, contracts(vendor)")
      .eq("workspace_id", ws)
      .order("sent_at", { ascending: false })
      .limit(10),
  ]);
  return NextResponse.json({
    migrated: !w.error,
    enabled: w.error ? true : w.data?.renewal_alerts !== false,
    days: alertDays(),
    emailConfigured: isEmailConfigured(),
    jobConfigured: Boolean(process.env.CRON_SECRET && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)),
    isAdmin: ctx.session.role === "owner",
    recent: log.error ? [] : log.data,
  });
}

/** Admins switch reminders on or off. */
export async function PATCH(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.session.role !== "owner") return NextResponse.json({ error: "Only admins can change reminders." }, { status: 403 });
  const { enabled } = (await req.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { error } = await ctx.supabase.from("workspaces").update({ renewal_alerts: enabled }).eq("id", ctx.session.workspace.id);
  if (error) return NextResponse.json({ error: needsMigration(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Sends the signed-in user a sample renewal alert, so they can see what it looks like in their inbox. */
export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  if (!isEmailConfigured()) return NextResponse.json({ error: "Add RESEND_API_KEY and EMAIL_FROM to the environment first." }, { status: 400 });
  const b = brand(new URL(req.url).origin);
  const workspace = ctx.session.workspace.name;
  const email = renewalAlertEmail(b, {
    workspace,
    reason: `you asked for a sample from Workspace settings in ${workspace}`,
    items: sampleAlertItems(toISO(new Date())),
  });
  const res = await sendEmail(ctx.session.email, { ...email, subject: `[Sample] ${email.subject}` }, { tags: { type: "sample_alert" } });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
  return NextResponse.json({ ok: true, to: ctx.session.email });
}
