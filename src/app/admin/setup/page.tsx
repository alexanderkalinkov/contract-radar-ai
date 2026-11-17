import Link from "next/link";
import { notFound } from "next/navigation";
import { btnGhost, Card, H2, PageHeader } from "@/components/ui";
import { ago, Pill, SetupNeeded, when } from "@/components/admin/bits";
import { getPlatformCtx } from "@/lib/server/platform";
import { dbChecks, envChecks, ERROR_KINDS, loadErrors, loadHealth, workspaceNames } from "@/lib/server/platform-data";

export const dynamic = "force-dynamic";

const JOBS: Record<string, { label: string; schedule: string }> = {
  "renewal-alerts": { label: "Renewal reminder emails", schedule: "daily 07:00 UTC" },
  "import-worker": { label: "Bulk import worker", schedule: "on demand + daily 06:30 UTC" },
};

const KIND_LABEL = Object.fromEntries(ERROR_KINDS.map((k) => [k.value, k.label]));

function errorDetails(d: Record<string, unknown> | null): string {
  if (!d) return "";
  return Object.entries(d)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

export default async function AdminSetup({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const sp = await searchParams;
  const kind = sp.kind ?? "";
  const q = (sp.q ?? "").trim();
  const [dbs, health, names, errors] = await Promise.all([dbChecks(ctx.db), loadHealth(ctx.db), workspaceNames(ctx.db), loadErrors(ctx.db, { kind, q })]);
  const qs = (k: string) => {
    const p = new URLSearchParams();
    if (k) p.set("kind", k);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/admin/setup${s ? `?${s}` : ""}#errors`;
  };
  const env = envChecks();
  const groups = [...new Set(env.map((e) => e.group))];

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Setup & health" />

      <Card label="Errors people ran into" className="flex scroll-mt-32 flex-col gap-4 p-5">
        <div id="errors" className="flex flex-col gap-1">
          <H2>Errors people ran into</H2>
          <span className="text-sm text-muted">Failed uploads and actions, page crashes and links to pages that don&apos;t exist, recorded from people&apos;s browsers as they happen. Each one shows who, where and what the app told them.</span>
        </div>
        {errors.missing ? (
          <SetupNeeded>Run <b>error-log.sql</b> in the Supabase SQL editor to start recording errors.</SetupNeeded>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {ERROR_KINDS.map((k) => (
                <Link key={k.value} href={qs(kind === k.value ? "" : k.value)} aria-current={kind === k.value ? "true" : undefined} className={"flex flex-col rounded-xl border p-3 transition-colors " + (kind === k.value ? "border-brand bg-brand-soft" : "border-line hover:border-brand-line")}>
                  <span className="text-xs font-semibold tracking-wide text-muted uppercase">{k.label}</span>
                  <span className={"font-display text-[22px] font-semibold " + (errors.counts[k.value]?.day ? "text-[#B42318]" : "text-ink")}>{errors.counts[k.value]?.day ?? 0}</span>
                  <span className="text-xs text-muted">today · {errors.counts[k.value]?.week ?? 0} this week</span>
                </Link>
              ))}
            </div>
            <form action="/admin/setup" className="flex flex-wrap items-center gap-2">
              {kind && <input type="hidden" name="kind" value={kind} />}
              <input name="q" defaultValue={q} placeholder="Email, message, page, user or workspace id" aria-label="Search errors" className="min-h-10 w-full max-w-sm rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm" />
              <button type="submit" className={btnGhost}>Search</button>
              {(kind || q) && <Link href="/admin/setup#errors" className="text-sm font-semibold text-brand">Clear</Link>}
              <span className="text-sm text-muted">Latest {errors.rows.length}</span>
            </form>
            {errors.rows.length === 0 ? (
              <p className="m-0 text-sm text-muted">Nothing recorded{kind || q ? " for this filter" : " yet"}.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
                {errors.rows.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <Pill tone={e.kind === "not_found" ? "muted" : e.kind === "crash" || (e.status ?? 0) >= 500 ? "bad" : "warn"}>{KIND_LABEL[e.kind] ?? e.kind}{e.status ? ` · ${e.status}` : ""}</Pill>
                      <b className="break-words">{e.message}</b>
                    </span>
                    <span className="text-xs text-ink-2">
                      {e.user_id ? <Link href={`/admin/users/${e.user_id}`} className="font-semibold text-brand">{e.email ?? "user"}</Link> : <span>Signed out</span>}
                      {e.workspace_id && <> in <Link href={`/admin/workspaces/${e.workspace_id}`} className="font-semibold text-brand">{names.get(e.workspace_id) ?? "workspace"}</Link></>}
                      {" · "}on <code>{e.page ?? "—"}</code>
                      {e.endpoint && <> · <code>{e.endpoint}</code></>}
                    </span>
                    {errorDetails(e.details) && <span className="text-xs break-words text-muted">{errorDetails(e.details)}</span>}
                    <span className="text-xs text-muted">{when(e.created_at)} · {e.browser ?? "unknown browser"}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

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
