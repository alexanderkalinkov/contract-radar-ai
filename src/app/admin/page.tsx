import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, H2, PageHeader } from "@/components/ui";
import { ago, BillingPill, day, Pill, SetupNeeded, Stat, UserStatusPill, when } from "@/components/admin/bits";
import { getPlatformCtx } from "@/lib/server/platform";
import { daysAgoIso, dbChecks, envChecks, loadHealth, loadUsers, loadWorkspaces } from "@/lib/server/platform-data";
import { isTestMode, isBillingConfigured } from "@/lib/server/billing";

export const dynamic = "force-dynamic";

type ActionRow = { id: number; actor_email: string; action: string; target_label: string | null; created_at: string };

export default async function AdminOverview() {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const [users, workspaces, health, dbs, recent] = await Promise.all([
    loadUsers(ctx.db),
    loadWorkspaces(ctx.db),
    loadHealth(ctx.db),
    dbChecks(ctx.db),
    ctx.db.from("platform_audit_log").select("id, actor_email, action, target_label, created_at").order("created_at", { ascending: false }).limit(8),
  ]);
  const env = envChecks();
  const week = daysAgoIso(7);
  const real = workspaces.filter((w) => !w.isDemo);
  const by = (s: string) => real.filter((w) => w.billing?.state === s);
  const trialsEnding = by("trial").filter((w) => (w.billing?.trialDaysLeft ?? 99) <= 7);
  const missingRequired = env.filter((e) => e.required && !e.set).length;
  const missingSql = dbs.filter((d) => !d.ok);
  const active30 = users.filter((u) => u.lastSignInAt && Date.parse(u.lastSignInAt) > Date.now() - 30 * 86_400_000).length;
  const platformTable = !recent.error;

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Overview">
        {isBillingConfigured() && <Pill tone={isTestMode() ? "warn" : "good"}>Stripe {isTestMode() ? "test mode" : "live"}</Pill>}
      </PageHeader>

      {!platformTable && (
        <SetupNeeded>
          Run <b>platform-admin.sql</b> in the Supabase SQL editor to switch on the admin action log, the support inbox and job health.
        </SetupNeeded>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Users" value={users.length} sub={`${active30} active in 30 days · ${users.filter((u) => Date.parse(u.createdAt) > Date.parse(week)).length} new this week`} href="/admin/users" />
        <Stat label="Workspaces" value={real.length} sub={`${workspaces.length - real.length} demo`} href="/admin/workspaces" />
        <Stat label="Paying" value={by("active").length + by("past_due").length} sub={by("past_due").length ? `${by("past_due").length} payment failed` : "active subscriptions"} href="/admin/billing" tone={by("past_due").length ? "bad" : undefined} />
        <Stat label="In trial" value={by("trial").length} sub={`${trialsEnding.length} end within 7 days`} href="/admin/billing" tone={trialsEnding.length ? "warn" : undefined} />
        <Stat label="Contracts" value={health.contracts.total} sub={`${health.contracts.last7} added this week`} />
        <Stat label="Open support" value={health.supportOpen ?? "—"} href="/admin/support" tone={health.supportOpen ? "warn" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card label="Needs attention" className="flex flex-col gap-3 p-5">
          <H2>Needs attention</H2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {missingRequired > 0 && (
              <li><Link href="/admin/setup" className="font-semibold text-[#B42318]">{missingRequired} required setting{missingRequired === 1 ? "" : "s"} missing in Vercel</Link></li>
            )}
            {missingSql.map((d) => (
              <li key={d.file}><Link href="/admin/setup" className="font-semibold text-[#B42318]">SQL not run: {d.file}</Link> <span className="text-muted">({d.label})</span></li>
            ))}
            {by("past_due").map((w) => (
              <li key={w.id}><Link href={`/admin/workspaces/${w.id}`} className="font-semibold text-ink">{w.name}</Link> <span className="text-muted">card payment failed</span></li>
            ))}
            {trialsEnding.map((w) => (
              <li key={w.id}><Link href={`/admin/workspaces/${w.id}`} className="font-semibold text-ink">{w.name}</Link> <span className="text-muted">trial ends {day(w.billing?.trialEndsAt)}</span></li>
            ))}
            {health.jobs.filter((j) => !j.ok).map((j) => (
              <li key={j.job}><Link href="/admin/setup" className="font-semibold text-[#B42318]">Job failed: {j.job}</Link> <span className="text-muted">{ago(j.last_run_at)}</span></li>
            ))}
            {health.imports.failedItems > 0 && <li><Link href="/admin/setup" className="font-semibold text-ink">{health.imports.failedItems} bulk-import files failed</Link> <span className="text-muted">last 30 days</span></li>}
            {health.inbound.failed > 0 && <li><Link href="/admin/setup" className="font-semibold text-ink">{health.inbound.failed} emailed contracts not added</Link> <span className="text-muted">last 30 days</span></li>}
            {(health.supportOpen ?? 0) > 0 && <li><Link href="/admin/support" className="font-semibold text-ink">{health.supportOpen} open support message{health.supportOpen === 1 ? "" : "s"}</Link></li>}
            {missingRequired === 0 && missingSql.length === 0 && by("past_due").length === 0 && trialsEnding.length === 0 && !health.jobs.some((j) => !j.ok) && !health.imports.failedItems && !health.inbound.failed && !health.supportOpen && (
              <li className="text-good-dark">Nothing needs you right now.</li>
            )}
          </ul>
        </Card>

        <Card label="Newest users" className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between"><H2>Newest users</H2><Link href="/admin/users" className="text-sm font-semibold text-brand">All users</Link></div>
          <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
            {users.slice(0, 6).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/admin/users/${u.id}`} className="min-w-0 truncate font-semibold text-ink">{u.email}</Link>
                <span className="flex items-center gap-2 text-xs text-muted">{ago(u.createdAt)} <UserStatusPill status={u.status} /></span>
              </li>
            ))}
          </ul>
        </Card>

        <Card label="Newest workspaces" className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between"><H2>Newest workspaces</H2><Link href="/admin/workspaces" className="text-sm font-semibold text-brand">All workspaces</Link></div>
          <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
            {real.slice(0, 6).map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/admin/workspaces/${w.id}`} className="min-w-0 truncate font-semibold text-ink">{w.name}</Link>
                <span className="flex items-center gap-2 text-xs text-muted">{w.members} people · {w.contracts} contracts <BillingPill billing={w.billing} /></span>
              </li>
            ))}
          </ul>
        </Card>

        <Card label="Recent admin actions" className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between"><H2>Recent admin actions</H2><Link href="/admin/audit" className="text-sm font-semibold text-brand">Audit log</Link></div>
          {((recent.data ?? []) as ActionRow[]).length === 0 ? (
            <p className="m-0 text-sm text-muted">No admin actions yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
              {((recent.data ?? []) as ActionRow[]).map((r) => (
                <li key={r.id} className="flex flex-col py-2">
                  <span><b>{r.action}</b> {r.target_label && <span className="text-ink-2">· {r.target_label}</span>}</span>
                  <span className="text-xs text-muted">{r.actor_email} · {when(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
