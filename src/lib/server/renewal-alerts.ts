import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, daysUntil, toISO } from "@/lib/engine";
import { alertDays, brand } from "@/lib/email/brand";
import { renewalAlertEmail, type AlertItem, type AlertKind } from "@/lib/email/templates";
import { escalatorsOf } from "@/lib/extraction";
import { buildPriceHistory } from "@/lib/price-history";
import { rowToSaved, type ContractRow as SavedRow } from "@/lib/saved";
import { isBillingConfigured, summarize, type BillingRow } from "./billing";
import { adminClient } from "./admin";
import { isEmailConfigured, sendEmail } from "./mailer";

// The daily renewal-alert job. For every real (non-demo) uploaded contract it looks at the notice deadline and the
// renewal / end date, and when one is 90, 60 or 30 days away (RENEWAL_ALERT_DAYS) it emails the department owner of
// the matching tool and every workspace admin. public.renewal_alerts remembers what was sent, so each reminder goes
// out once, and a missed day (or a contract uploaded late) is caught up on the next run.

export interface AlertRunOptions {
  /** YYYY-MM-DD; defaults to today in UTC. */
  today?: string;
  /** Work out what would be sent without sending or recording anything. */
  dryRun?: boolean;
  /** Limit to one workspace (used by the "send me a preview" button). */
  workspaceId?: string;
  /** For tests: a client to use instead of the service-role one. */
  db?: SupabaseClient;
}

export interface AlertRunReport {
  today: string;
  reminderDays: number[];
  dryRun: boolean;
  emailConfigured: boolean;
  workspaces: number;
  contractsChecked: number;
  emails: { to: string; workspace: string; subject: string; items: number; sent: boolean; error?: string }[];
  notes: string[];
}

interface ContractRow {
  id: string;
  workspace_id: string;
  vendor: string;
  agreement_name: string | null;
  term_end: string | null;
  auto_renew: boolean | null;
  renewal_term_months: number | null;
  notice_days: number | null;
  notice_deadline: string | null;
  annual_fee: number | string | null;
  currency: string | null;
  uplift_cap_pct: number | string | null;
}

const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));

export function bucketFor(days: number, reminderDays: number[]): number | null {
  if (days < 0) return null;
  const fits = reminderDays.filter((t) => days <= t);
  return fits.length ? Math.min(...fits) : null;
}

/** The dates in a contract that get reminders. */
export function contractEvents(c: Pick<ContractRow, "notice_deadline" | "term_end" | "auto_renew">): { kind: AlertKind; date: string }[] {
  const out: { kind: AlertKind; date: string }[] = [];
  if (c.auto_renew !== false && c.notice_deadline) out.push({ kind: "notice", date: c.notice_deadline });
  if (c.term_end) {
    if (c.auto_renew) out.push({ kind: "renewal", date: addDays(c.term_end, 1) });
    else out.push({ kind: "term_end", date: c.term_end });
  }
  return out;
}

export async function runRenewalAlerts(opts: AlertRunOptions = {}): Promise<AlertRunReport> {
  const today = opts.today ?? toISO(new Date());
  const reminderDays = alertDays();
  const maxDays = Math.max(...reminderDays);
  const dryRun = Boolean(opts.dryRun) || !isEmailConfigured();
  const report: AlertRunReport = {
    today,
    reminderDays,
    dryRun,
    emailConfigured: isEmailConfigured(),
    workspaces: 0,
    contractsChecked: 0,
    emails: [],
    notes: [],
  };
  if (!isEmailConfigured()) report.notes.push("RESEND_API_KEY is not set: nothing was sent (dry run).");

  const db = opts.db ?? adminClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set, so the alert job can't read contracts.");

  // Workspaces with reminders switched on (the column arrives with the renewal_alerts migration).
  let wsQuery = db.from("workspaces").select("id, name, renewal_alerts");
  if (opts.workspaceId) wsQuery = wsQuery.eq("id", opts.workspaceId);
  const ws = await wsQuery;
  if (ws.error) {
    if (/renewal_alerts/.test(ws.error.message)) throw new Error("Run supabase/migrations/20261116120000_renewal_alerts.sql in the Supabase SQL editor first.");
    throw new Error(ws.error.message);
  }
  let workspaces = (ws.data ?? []).filter((w) => w.renewal_alerts !== false);
  // No reminders for workspaces whose free trial or subscription has ended.
  if (isBillingConfigured() && workspaces.length) {
    const billing = await db.from("workspace_billing").select("*").in("workspace_id", workspaces.map((w) => w.id as string));
    if (!billing.error) {
      const rows = new Map((billing.data ?? []).map((r) => [r.workspace_id as string, r as BillingRow]));
      const locked = workspaces.filter((w) => !summarize(rows.get(w.id as string) ?? null).access);
      if (locked.length) report.notes.push(`Skipped ${locked.length} workspace(s) without an active plan or trial.`);
      workspaces = workspaces.filter((w) => !locked.includes(w));
    }
  }
  report.workspaces = workspaces.length;
  if (!workspaces.length) return report;
  const wsIds = workspaces.map((w) => w.id as string);
  const wsName = new Map(workspaces.map((w) => [w.id as string, w.name as string]));

  const [c, t, d, m] = await Promise.all([
    db
      .from("contracts")
      .select("*") // includes extraction (and supersedes_id once that migration has run) for price-hike tracking
      .in("workspace_id", wsIds)
      .eq("demo", false),
    db.from("tools").select("contract_id, department_id").in("workspace_id", wsIds).not("contract_id", "is", null),
    db.from("departments").select("id, name").in("workspace_id", wsIds),
    db.from("workspace_members").select("workspace_id, email, role, department_id").in("workspace_id", wsIds),
  ]);
  const err = [c, t, d, m].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);

  const deptOfContract = new Map((t.data ?? []).map((x) => [x.contract_id as string, x.department_id as string | null]));
  const deptName = new Map((d.data ?? []).map((x) => [x.id as string, x.name as string]));
  const members = (m.data ?? []) as { workspace_id: string; email: string; role: string; department_id: string | null }[];

  // Older terms and renewal quotes fold into the contract they belong to: no reminders of their own, and the
  // contract's reminder says how the new price compares with the current one.
  const rows = (c.data ?? []) as (ContractRow & SavedRow)[];
  const history = buildPriceHistory(rows.filter((r) => r.extraction).map(rowToSaved));

  // Due reminders per contract.
  type Due = AlertItem & { workspaceId: string; departmentId: string | null };
  const due: Due[] = [];
  for (const row of rows) {
    if (history.hidden.has(row.id)) continue;
    report.contractsChecked++;
    const change = history.changes.get(row.id);
    const escalator = row.extraction ? escalatorsOf(row.extraction)[0]?.description ?? null : null;
    for (const ev of contractEvents(row)) {
      const days = daysUntil(ev.date, today);
      if (days > maxDays) continue;
      const bucket = bucketFor(days, reminderDays);
      if (bucket == null) continue;
      const departmentId = deptOfContract.get(row.id) ?? null;
      due.push({
        workspaceId: row.workspace_id,
        departmentId,
        contractId: row.id,
        vendor: row.vendor,
        agreement: row.agreement_name,
        kind: ev.kind,
        date: ev.date,
        daysLeft: days,
        bucket,
        annualFee: num(row.annual_fee),
        currency: row.currency,
        renewalTermMonths: row.renewal_term_months,
        noticeDays: row.notice_days,
        upliftCapPct: num(row.uplift_cap_pct),
        department: departmentId ? (deptName.get(departmentId) ?? null) : null,
        priceChange:
          change && change.deltaAbs > 0
            ? {
                source: change.source,
                previousFee: change.previousFee,
                newFee: change.newFee,
                deltaAbs: change.deltaAbs,
                deltaPct: change.deltaPct,
                capPct: change.capPct,
                overCap: change.overCap,
              }
            : null,
        escalator,
      });
    }
  }
  if (!due.length) return report;

  const log = await db
    .from("renewal_alerts")
    .select("contract_id, kind, event_date, days_before, recipient")
    .in("contract_id", [...new Set(due.map((x) => x.contractId))]);
  if (log.error) {
    if (/renewal_alerts/.test(log.error.message)) throw new Error("Run supabase/migrations/20261116120000_renewal_alerts.sql in the Supabase SQL editor first.");
    throw new Error(log.error.message);
  }
  const key = (cid: string, kind: string, date: string, bucket: number, to: string) => `${cid}|${kind}|${date}|${bucket}|${to}`;
  const sent = new Set((log.data ?? []).map((r) => key(r.contract_id, r.kind, r.event_date, r.days_before, r.recipient)));

  // Group into one email per person per workspace.
  const outbox = new Map<string, { to: string; workspaceId: string; reason: string; items: Due[] }>();
  for (const item of due) {
    const name = wsName.get(item.workspaceId) ?? "your workspace";
    const recipients = members.filter(
      (x) => x.workspace_id === item.workspaceId && (x.role === "owner" || x.role === "approver" || (x.role === "member" && item.departmentId && x.department_id === item.departmentId)),
    );
    for (const r of recipients) {
      const to = r.email.toLowerCase();
      if (sent.has(key(item.contractId, item.kind, item.date, item.bucket, to))) continue;
      const k = `${item.workspaceId}|${to}`;
      const reason =
        r.role === "owner"
          ? `you're an admin of ${name} on ${brand().name}`
          : r.role === "approver"
            ? `you approve renewals for ${name} on ${brand().name}`
          : `you own the ${item.department ?? "department"} department in ${name} on ${brand().name}`;
      const box = outbox.get(k) ?? { to, workspaceId: item.workspaceId, reason, items: [] };
      box.items.push(item);
      outbox.set(k, box);
    }
  }

  const b = brand();
  for (const box of outbox.values()) {
    const workspace = wsName.get(box.workspaceId) ?? "your workspace";
    const email = renewalAlertEmail(b, { workspace, reason: box.reason, items: box.items });
    const entry: AlertRunReport["emails"][number] = { to: box.to, workspace, subject: email.subject, items: box.items.length, sent: false };
    report.emails.push(entry);
    if (dryRun) continue;
    const res = await sendEmail(box.to, email, { tags: { type: "renewal_alert" } });
    if (!res.ok) {
      entry.error = res.error;
      continue;
    }
    entry.sent = true;
    const rows = box.items.map((i) => ({
      workspace_id: box.workspaceId,
      contract_id: i.contractId,
      kind: i.kind,
      event_date: i.date,
      days_before: i.bucket,
      recipient: box.to,
      provider_id: res.id,
    }));
    const ins = await db.from("renewal_alerts").upsert(rows, { onConflict: "contract_id,kind,event_date,days_before,recipient", ignoreDuplicates: true });
    if (ins.error) report.notes.push(`Sent to ${box.to} but couldn't record it: ${ins.error.message}`);
  }
  return report;
}
