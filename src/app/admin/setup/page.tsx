import { notFound } from "next/navigation";
import { Card, H2, PageHeader } from "@/components/ui";
import { ago, Pill, when } from "@/components/admin/bits";
import { getPlatformCtx } from "@/lib/server/platform";
import { dbChecks, envChecks, loadHealth, workspaceNames } from "@/lib/server/platform-data";

export const dynamic = "force-dynamic";

const JOBS: Record<string, { label: string; schedule: string }> = {
  "renewal-alerts": { label: "Renewal reminder emails", schedule: "daily 07:00 UTC" },
  "import-worker": { label: "Bulk import worker", schedule: "on demand + daily 06:30 UTC" },
};

export default async function AdminSetup() {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const [dbs, health, names] = await Promise.all([dbChecks(ctx.db), loadHealth(ctx.db), workspaceNames(ctx.db)]);
  const env = envChecks();
  const groups = [...new Set(env.map((e) => e.group))];

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Setup & health" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card label="Scheduled jobs" className="flex flex-col gap-3 p-5">
          <H2>Scheduled jobs</H2>
          <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
            {Object.entries(JOBS).map(([key, j]) => {
              const run = health.jobs.find((r) => r.job === key);
              return (
                <li key={key} className="flex flex-col gap-1 py-2.5">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <b>{j.label}</b>
                    {run ? <Pill tone={run.ok ? "good" : "bad"}>{run.ok ? "OK" : "Failed"} · {ago(run.last_run_at)}</Pill> : <Pill tone="muted">No run recorded yet</Pill>}
                  </span>
                  <span className="text-xs text-muted">
                    {j.schedule}
                    {run && Object.keys(run.summary ?? {}).length > 0 && ` · ${Object.entries(run.summary).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}`}
                  </span>
                  {run?.error && <span className="text-xs text-[#B42318]">{run.error}</span>}
                </li>
              );
            })}
          </ul>
          <p className="m-0 text-xs text-muted">
            Reminders sent in the last 7 days: <b>{health.remindersLast7}</b> · last one {ago(health.lastReminderAt)}.
          </p>
        </Card>

        <Card label="Database" className="flex flex-col gap-3 p-5">
          <H2>Database (SQL files)</H2>
          <ul className="m-0 grid list-none gap-1.5 p-0 text-sm sm:grid-cols-2">
            {dbs.map((d) => (
              <li key={d.file} className="flex items-center gap-2">
                <span aria-hidden="true" className={d.ok ? "text-good" : "text-[#B42318]"}>{d.ok ? "✓" : "✗"}</span>
                <span className={d.ok ? "text-ink-2" : "font-semibold text-[#B42318]"}>{d.label}</span>
                {!d.ok && <span className="text-xs text-muted">run {d.file}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card label="Environment" className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <H2>Environment variables</H2>
          <span className="text-sm text-muted">What&apos;s set on this deployment (Vercel → Settings → Environment Variables). Values are never shown. Redeploy after changing one.</span>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">{g}</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {env.filter((e) => e.group === g).map((e) => (
                  <li key={e.label} className="flex flex-col">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className={e.set ? "text-good" : e.required ? "text-[#B42318]" : "text-muted"}>{e.set ? "✓" : e.required ? "✗" : "○"}</span>
                      <span className={!e.set && e.required ? "font-semibold text-[#B42318]" : "text-ink"}>{e.label}</span>
                      {!e.set && <Pill tone={e.required ? "bad" : "muted"}>{e.required ? "Missing" : "Not set"}</Pill>}
                    </span>
                    <span className="pl-5 text-xs text-muted">
                      <code>{e.keys.join(", ")}</code>
                      {e.note && ` · ${e.note}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card label="Bulk import failures" className="flex flex-col gap-3 p-5">
          <H2>Bulk import failures (30 days)</H2>
          {health.imports.recentFailures.length === 0 ? (
            <p className="m-0 text-sm text-muted">None.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
              {health.imports.recentFailures.map((f) => (
                <li key={f.id} className="flex flex-col py-2">
                  <span><b>{f.file_name}</b> <span className="text-muted">in {names.get(f.workspace_id) ?? "—"}</span></span>
                  <span className="text-xs text-[#B42318]">{f.error ?? "Failed"}</span>
                  <span className="text-xs text-muted">{when(f.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card label="Emailed contracts not added" className="flex flex-col gap-3 p-5">
          <H2>Emailed contracts not added (30 days)</H2>
          <p className="m-0 text-xs text-muted">{health.inbound.total} emails received in the last 7 days.</p>
          {health.inbound.recentFailures.length === 0 ? (
            <p className="m-0 text-sm text-muted">None.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
              {health.inbound.recentFailures.map((f) => (
                <li key={f.id} className="flex flex-col py-2">
                  <span><b>{f.subject || "(no subject)"}</b> <span className="text-muted">from {f.from_email ?? "—"} · {f.workspace_id ? names.get(f.workspace_id) ?? "—" : "no workspace"}</span></span>
                  <span className="text-xs text-[#B42318]">{f.status}{f.detail ? `: ${f.detail}` : ""}</span>
                  <span className="text-xs text-muted">{when(f.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
