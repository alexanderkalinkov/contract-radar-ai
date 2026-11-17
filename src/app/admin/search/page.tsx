import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, H2, PageHeader } from "@/components/ui";
import { BillingPill, Pill, UserStatusPill } from "@/components/admin/bits";
import { getPlatformCtx } from "@/lib/server/platform";
import { loadUsers, loadWorkspaces } from "@/lib/server/platform-data";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One search box for the whole console: an exact user or workspace id jumps straight to it. */
export default async function AdminSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const q = ((await searchParams).q ?? "").trim();
  const needle = q.toLowerCase();
  const [users, workspaces] = needle ? await Promise.all([loadUsers(ctx.db), loadWorkspaces(ctx.db)]) : [[], []];

  if (UUID.test(q)) {
    if (users.some((u) => u.id === needle)) redirect(`/admin/users/${needle}`);
    if (workspaces.some((w) => w.id === needle)) redirect(`/admin/workspaces/${needle}`);
  }
  const us = users.filter((u) => u.id.includes(needle) || u.email.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle));
  const ws = workspaces.filter((w) => w.id.includes(needle) || w.name.toLowerCase().includes(needle) || w.admins.some((a) => a.includes(needle)));
  let errors = 0;
  let support = 0;
  if (UUID.test(q)) {
    const [e, s] = await Promise.all([
      ctx.db.from("app_errors").select("id", { head: true, count: "exact" }).or(`user_id.eq.${needle},workspace_id.eq.${needle}`),
      ctx.db.from("support_requests").select("id", { head: true, count: "exact" }).or(`id.eq.${needle},user_id.eq.${needle},workspace_id.eq.${needle}`),
    ]);
    errors = e.count ?? 0;
    support = s.count ?? 0;
  }

  return (
    <>
      <PageHeader eyebrow="Platform admin" title={q ? `Search: ${q}` : "Search"} />
      {!q && <p className="m-0 text-sm text-muted">Type an email, name, workspace name, or a user, workspace or support id in the search box at the top.</p>}
      {q && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card label="Users" className="flex flex-col gap-3 p-5">
            <H2>Users ({us.length})</H2>
            <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
              {us.slice(0, 50).map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/users/${u.id}`} className="min-w-0 truncate font-semibold text-ink">{u.email}</Link>
                  <UserStatusPill status={u.status} />
                </li>
              ))}
              {us.length === 0 && <li className="py-2 text-muted">No users match.</li>}
            </ul>
          </Card>
          <Card label="Workspaces" className="flex flex-col gap-3 p-5">
            <H2>Workspaces ({ws.length})</H2>
            <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
              {ws.slice(0, 50).map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/workspaces/${w.id}`} className="min-w-0 truncate font-semibold text-ink">{w.name}{w.isDemo && <span className="ml-2"><Pill tone="warn">Demo</Pill></span>}</Link>
                  <BillingPill billing={w.billing} />
                </li>
              ))}
              {ws.length === 0 && <li className="py-2 text-muted">No workspaces match.</li>}
            </ul>
          </Card>
          {UUID.test(q) && (
            <Card label="Other matches" className="flex flex-col gap-2 p-5 text-sm lg:col-span-2">
              <H2>Other matches</H2>
              <Link href={`/admin/support?status=all&q=${needle}`} className="font-semibold text-brand">{support} support message{support === 1 ? "" : "s"}</Link>
              <Link href={`/admin/setup?q=${needle}#errors`} className="font-semibold text-brand">{errors} logged error{errors === 1 ? "" : "s"}</Link>
              <Link href={`/admin/audit?ws=${needle}`} className="font-semibold text-brand">Audit log for this workspace id</Link>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
