import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { BillingSummary } from "@/lib/billing/plans";
import { parseRole, type Role } from "@/lib/roles";
import { isBillingConfigured, isTestMode, summarize, type BillingRow } from "./billing";
import { isPlatformAdminEmailFromEnv } from "./platform";

// Read-only loaders for the platform admin console. All of them use the service-role client, so they see
// every workspace. Only call them after getPlatformCtx() / requirePlatformAdmin() said yes.

const DAY = 86_400_000;
export const daysAgoIso = (n: number) => new Date(Date.now() - n * DAY).toISOString();

export type UserStatus = "active" | "disabled" | "unconfirmed" | "invited";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastSignInAt: string | null;
  confirmedAt: string | null;
  invitedAt: string | null;
  bannedUntil: string | null;
  provider: string;
  status: UserStatus;
  platformAdmin: boolean;
  memberships: { workspaceId: string; workspaceName: string; role: Role; isDemo: boolean }[];
}

function statusOf(u: User): UserStatus {
  const banned = (u as User & { banned_until?: string | null }).banned_until;
  if (banned && Date.parse(banned) > Date.now()) return "disabled";
  if (!u.email_confirmed_at && !u.last_sign_in_at) return u.invited_at ? "invited" : "unconfirmed";
  return "active";
}

/** Every auth user (up to 10,000), newest first. */
export async function listAuthUsers(db: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

async function platformAdminIds(db: SupabaseClient): Promise<Set<string>> {
  const { data } = await db.from("platform_admins").select("user_id");
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
}

type WsRow = { id: string; name: string; is_demo?: boolean; created_at: string; renewal_alerts?: boolean; created_by?: string | null };
type MemberRow = { workspace_id: string; user_id: string; email: string; role: string; created_at: string };

function toAdminUser(u: User, members: MemberRow[], wsById: Map<string, WsRow>, admins: Set<string>): AdminUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const email = u.email ?? "";
  return {
    id: u.id,
    email,
    name: str(meta.full_name) || str(meta.name),
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    confirmedAt: u.email_confirmed_at ?? null,
    invitedAt: u.invited_at ?? null,
    bannedUntil: (u as User & { banned_until?: string | null }).banned_until ?? null,
    provider: String(u.app_metadata?.provider ?? "email"),
    status: statusOf(u),
    platformAdmin: admins.has(u.id) || (email !== "" && isPlatformAdminEmailFromEnv(email)),
    memberships: members
      .filter((m) => m.user_id === u.id)
      .map((m) => {
        const w = wsById.get(m.workspace_id);
        return { workspaceId: m.workspace_id, workspaceName: w?.name ?? "(deleted)", role: parseRole(m.role), isDemo: Boolean(w?.is_demo) };
      }),
  };
}

export async function loadUsers(db: SupabaseClient): Promise<AdminUser[]> {
  const [users, ws, members, admins] = await Promise.all([
    listAuthUsers(db),
    db.from("workspaces").select("*"),
    db.from("workspace_members").select("workspace_id, user_id, email, role, created_at"),
    platformAdminIds(db),
  ]);
  const wsById = new Map(((ws.data ?? []) as WsRow[]).map((w) => [w.id, w]));
  const m = (members.data ?? []) as MemberRow[];
  return users.map((u) => toAdminUser(u, m, wsById, admins));
}

export async function loadUser(db: SupabaseClient, id: string): Promise<AdminUser | null> {
  const { data, error } = await db.auth.admin.getUserById(id);
  if (error || !data.user) return null;
  const [ws, members, admins] = await Promise.all([
    db.from("workspaces").select("*"),
    db.from("workspace_members").select("workspace_id, user_id, email, role, created_at").eq("user_id", id),
    platformAdminIds(db),
  ]);
  const wsById = new Map(((ws.data ?? []) as WsRow[]).map((w) => [w.id, w]));
  return toAdminUser(data.user, (members.data ?? []) as MemberRow[], wsById, admins);
}

export interface AdminWorkspace {
  id: string;
  name: string;
  createdAt: string;
  isDemo: boolean;
  renewalAlerts: boolean;
  members: number;
  invites: number;
  contracts: number;
  admins: string[];
  billingRow: BillingRow | null;
  billing: BillingSummary | null;
}

export async function loadWorkspaces(db: SupabaseClient): Promise<AdminWorkspace[]> {
  const [ws, members, invites, contracts, billing] = await Promise.all([
    db.from("workspaces").select("*").order("created_at", { ascending: false }),
    db.from("workspace_members").select("workspace_id, email, role"),
    db.from("workspace_invites").select("workspace_id"),
    db.from("contracts").select("workspace_id").limit(50_000),
    db.from("workspace_billing").select("*"),
  ]);
  const count = (rows: { workspace_id: string }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) map.set(r.workspace_id, (map.get(r.workspace_id) ?? 0) + 1);
    return map;
  };
  const mc = count(members.data as { workspace_id: string }[] | null);
  const ic = count(invites.data as { workspace_id: string }[] | null);
  const cc = count(contracts.data as { workspace_id: string }[] | null);
  const bills = new Map(((billing.data ?? []) as BillingRow[]).map((b) => [b.workspace_id, b]));
  const on = isBillingConfigured() && !billing.error;
  return ((ws.data ?? []) as WsRow[]).map((w) => {
    const row = bills.get(w.id) ?? null;
    return {
      id: w.id,
      name: w.name,
      createdAt: w.created_at,
      isDemo: Boolean(w.is_demo),
      renewalAlerts: w.renewal_alerts !== false,
      members: mc.get(w.id) ?? 0,
      invites: ic.get(w.id) ?? 0,
      contracts: cc.get(w.id) ?? 0,
      admins: ((members.data ?? []) as { workspace_id: string; email: string; role: string }[])
        .filter((m) => m.workspace_id === w.id && m.role === "owner")
        .map((m) => m.email),
      billingRow: row,
      billing: on ? summarize(row) : null,
    };
  });
}

export const stripeDashboardUrl = (kind: "customers" | "subscriptions", id: string) =>
  `https://dashboard.stripe.com/${isTestMode() ? "test/" : ""}${kind}/${id}`;

// ---------------------------------------------------------------------------
// Setup checks: which environment variables and SQL files are in place. Values are never read out.
// ---------------------------------------------------------------------------

export interface EnvCheck {
  group: string;
  label: string;
  keys: string[];
  /** The app needs it to work at all, as opposed to a feature that stays off without it. */
  required: boolean;
  set: boolean;
  note?: string;
}

const has = (k: string) => Boolean(process.env[k]?.trim());
const any = (...k: string[]) => k.some(has);
const all = (...k: string[]) => k.every(has);

export function envChecks(): EnvCheck[] {
  const c = (group: string, label: string, keys: string[], required: boolean, set: boolean, note?: string): EnvCheck => ({ group, label, keys, required, set, note });
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  return [
    c("Core", "Supabase project", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], true, has("NEXT_PUBLIC_SUPABASE_URL") && any("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")),
    c("Core", "Supabase service role key", ["SUPABASE_SERVICE_ROLE_KEY"], true, any("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"), "Server jobs, invites, billing and this console."),
    c("Core", "Public app address", ["APP_URL"], true, has("APP_URL"), "Used in email links and Stripe redirects."),
    c("Core", "Claude (contract reading)", ["ANTHROPIC_API_KEY"], true, any("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")),
    c("Email", "Resend sending key", ["RESEND_API_KEY"], true, has("RESEND_API_KEY")),
    c("Email", "From address", ["EMAIL_FROM"], true, has("EMAIL_FROM")),
    c("Email", "Support inbox", ["SUPPORT_EMAIL"], false, has("SUPPORT_EMAIL")),
    c("Email", "Scheduled jobs secret", ["CRON_SECRET"], true, has("CRON_SECRET"), "Renewal reminders and the import worker."),
    c("Email-in contracts", "Inbound domain", ["INBOUND_EMAIL_DOMAIN"], false, has("INBOUND_EMAIL_DOMAIN")),
    c("Email-in contracts", "Inbound webhook secret", ["RESEND_WEBHOOK_SECRET"], false, has("RESEND_WEBHOOK_SECRET")),
    c("Billing", "Stripe secret key", ["STRIPE_SECRET_KEY"], false, has("STRIPE_SECRET_KEY"), stripeKey ? (stripeKey.startsWith("sk_test_") ? "Test mode" : "Live mode") : "Billing is off until this is set."),
    c("Billing", "Stripe webhook secret", ["STRIPE_WEBHOOK_SECRET"], false, has("STRIPE_WEBHOOK_SECRET")),
    c("Connectors", "Connector encryption key", ["CONNECTOR_ENCRYPTION_KEY"], false, has("CONNECTOR_ENCRYPTION_KEY"), "Needed before any connector can be used."),
    c("Connectors", "Google Workspace / Drive", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], false, all("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")),
    c("Connectors", "Microsoft 365 / SharePoint", ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"], false, all("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET")),
    c("Connectors", "QuickBooks", ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"], false, all("QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET")),
    c("Connectors", "Xero", ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"], false, all("XERO_CLIENT_ID", "XERO_CLIENT_SECRET")),
    c("Legal", "Company details on legal pages", ["LEGAL_COMPANY_NAME", "LEGAL_COMPANY_ID", "LEGAL_ADDRESS", "LEGAL_EMAIL"], false, all("LEGAL_COMPANY_NAME", "LEGAL_COMPANY_ID", "LEGAL_ADDRESS", "LEGAL_EMAIL")),
    c("Legal", "Lawyer review done", ["LEGAL_REVIEWED"], false, process.env.LEGAL_REVIEWED === "true", "Hides the draft banner."),
    c("Enterprise", "SAML SSO switched on", ["SSO_ENABLED"], false, process.env.SSO_ENABLED === "true", "Needs Supabase Pro."),
    c("Platform", "Platform admin emails", ["PLATFORM_ADMIN_EMAILS"], false, has("PLATFORM_ADMIN_EMAILS"), "Optional: admins can also be added on the Users page."),
  ];
}

export interface DbCheck {
  label: string;
  file: string;
  ok: boolean;
}

/** Each SQL file in project files, checked by a table or column it adds. */
const DB_PROBES: { label: string; file: string; table: string; column?: string }[] = [
  { label: "Workspaces and contracts", file: "setup-database.sql", table: "contracts" },
  { label: "Team onboarding", file: "team-onboarding.sql", table: "departments" },
  { label: "Auto-discovery", file: "auto-discovery.sql", table: "discovered_tools" },
  { label: "Renewal reminders", file: "renewal-alerts.sql", table: "renewal_alerts" },
  { label: "Billing", file: "billing.sql", table: "workspace_billing" },
  { label: "Demo workspace", file: "demo-workspace.sql", table: "workspaces", column: "is_demo" },
  { label: "Price history", file: "price-history.sql", table: "contracts", column: "supersedes_id" },
  { label: "Email-in contracts", file: "email-inbox.sql", table: "inbound_emails" },
  { label: "Seat usage", file: "seat-usage.sql", table: "discovery_signals", column: "active_users" },
  { label: "Renewal approvals", file: "renewal-approvals.sql", table: "renewal_reviews" },
  { label: "Bulk import", file: "bulk-import.sql", table: "import_jobs" },
  { label: "Audit log, entities and SSO", file: "audit-entities-sso.sql", table: "audit_log" },
  { label: "Platform admin console", file: "platform-admin.sql", table: "platform_audit_log" },
];

export async function dbChecks(db: SupabaseClient): Promise<DbCheck[]> {
  return Promise.all(
    DB_PROBES.map(async (p) => {
      const { error } = await db.from(p.table).select(p.column ?? "*", { head: true, count: "exact" }).limit(1);
      return { label: p.label, file: p.file, ok: !error };
    }),
  );
}

// ---------------------------------------------------------------------------
// Health: scheduled jobs, emails and extraction problems.
// ---------------------------------------------------------------------------

export interface JobRun {
  job: string;
  last_run_at: string;
  ok: boolean;
  summary: Record<string, unknown>;
  error: string | null;
}

export interface Health {
  jobs: JobRun[];
  remindersLast7: number;
  lastReminderAt: string | null;
  inbound: { total: number; failed: number; recentFailures: { id: string; from_email: string | null; subject: string | null; status: string; detail: string | null; created_at: string; workspace_id: string | null }[] };
  imports: { failedItems: number; recentFailures: { id: string; file_name: string; error: string | null; workspace_id: string; created_at: string }[] };
  contracts: { total: number; last7: number; unverified: number };
  supportOpen: number | null;
}

export async function loadHealth(db: SupabaseClient): Promise<Health> {
  const week = daysAgoIso(7);
  const [jobs, rem, lastRem, inbound, inboundFail, failedItems, contracts, contracts7, unverified, support] = await Promise.all([
    db.from("job_runs").select("*"),
    db.from("renewal_alerts").select("id", { head: true, count: "exact" }).gte("sent_at", week),
    db.from("renewal_alerts").select("sent_at").order("sent_at", { ascending: false }).limit(1),
    db.from("inbound_emails").select("id", { head: true, count: "exact" }).gte("created_at", week),
    db.from("inbound_emails").select("id, from_email, subject, status, detail, created_at, workspace_id").in("status", ["failed", "rejected", "partial"]).gte("created_at", daysAgoIso(30)).order("created_at", { ascending: false }).limit(10),
    db.from("import_items").select("id, file_name, error, workspace_id, created_at", { count: "exact" }).eq("status", "failed").gte("created_at", daysAgoIso(30)).order("created_at", { ascending: false }).limit(10),
    db.from("contracts").select("id", { head: true, count: "exact" }),
    db.from("contracts").select("id", { head: true, count: "exact" }).gte("created_at", week),
    db.from("contracts").select("id", { head: true, count: "exact" }).eq("extraction->>verified", "false"),
    db.from("support_requests").select("id", { head: true, count: "exact" }).eq("status", "open"),
  ]);
  return {
    jobs: (jobs.data ?? []) as JobRun[],
    remindersLast7: rem.count ?? 0,
    lastReminderAt: ((lastRem.data ?? [])[0] as { sent_at?: string } | undefined)?.sent_at ?? null,
    inbound: { total: inbound.count ?? 0, failed: (inboundFail.data ?? []).length, recentFailures: (inboundFail.data ?? []) as Health["inbound"]["recentFailures"] },
    imports: { failedItems: failedItems.count ?? 0, recentFailures: (failedItems.data ?? []) as Health["imports"]["recentFailures"] },
    contracts: { total: contracts.count ?? 0, last7: contracts7.count ?? 0, unverified: unverified.error ? 0 : (unverified.count ?? 0) },
    supportOpen: support.error ? null : (support.count ?? 0),
  };
}

export async function workspaceNames(db: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await db.from("workspaces").select("id, name");
  return new Map(((data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]));
}
