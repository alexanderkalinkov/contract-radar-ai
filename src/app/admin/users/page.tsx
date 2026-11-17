import Link from "next/link";
import { notFound } from "next/navigation";
import { btnGhost, Card, PageHeader } from "@/components/ui";
import { ago, day, Pill, Th, UserStatusPill } from "@/components/admin/bits";
import { roleLabel } from "@/lib/roles";
import { getPlatformCtx } from "@/lib/server/platform";
import { loadUsers, type UserStatus } from "@/lib/server/platform-data";

export const dynamic = "force-dynamic";

const FILTERS: { value: "" | UserStatus | "admins"; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "active", label: "Active" },
  { value: "unconfirmed", label: "Not confirmed" },
  { value: "invited", label: "Invited" },
  { value: "disabled", label: "Disabled" },
  { value: "admins", label: "Platform admins" },
];

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const { q = "", status = "" } = await searchParams;
  const all = await loadUsers(ctx.db);
  const needle = q.trim().toLowerCase();
  const users = all.filter(
    (u) =>
      (!needle || u.id.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle) || u.memberships.some((m) => m.workspaceId.includes(needle)) || u.name.toLowerCase().includes(needle) || u.memberships.some((m) => m.workspaceName.toLowerCase().includes(needle))) &&
      (!status || (status === "admins" ? u.platformAdmin : u.status === status)),
  );

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Users" />
      <form className="flex flex-wrap items-center gap-2" action="/admin/users">
        <input name="q" defaultValue={q} placeholder="Email, name, workspace or id" aria-label="Search users" className="min-h-11 w-full max-w-sm rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm" />
        <select name="status" defaultValue={status} aria-label="Status" className="min-h-11 rounded-[10px] border border-[#D0D5DD] bg-white px-2 text-sm">
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <button type="submit" className={btnGhost}>Filter</button>
        <span className="text-sm text-muted">{users.length} of {all.length}</span>
      </form>

      <Card label="Users" className="rtable-wrap overflow-x-auto">
        <table className="rtable w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <Th>Person</Th>
              <Th>Status</Th>
              <Th>Workspaces and roles</Th>
              <Th>Last sign-in</Th>
              <Th>Joined</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line-soft align-top">
                <td className="rt-full px-5 py-3">
                  <Link href={`/admin/users/${u.id}`} className="flex flex-col">
                    <span className="font-semibold text-ink">{u.email}</span>
                    <span className="text-xs text-muted">{[u.name, u.provider !== "email" ? `via ${u.provider}` : ""].filter(Boolean).join(" · ") || " "}</span>
                  </Link>
                </td>
                <td data-label="Status" className="px-3 py-3">
                  <span className="flex flex-wrap gap-1">
                    <UserStatusPill status={u.status} />
                    {u.platformAdmin && <Pill tone="brand">Platform admin</Pill>}
                  </span>
                </td>
                <td data-label="Workspaces" className="rt-full px-3 py-3">
                  {u.memberships.length === 0 ? (
                    <span className="text-muted">None</span>
                  ) : (
                    <span className="flex flex-col gap-0.5">
                      {u.memberships.map((m) => (
                        <Link key={m.workspaceId} href={`/admin/workspaces/${m.workspaceId}`} className="text-ink-2 hover:text-brand">
                          {m.workspaceName}
                          {m.isDemo && !/demo/i.test(m.workspaceName) && " (demo)"} <span className="text-muted">· {roleLabel(m.role)}</span>
                        </Link>
                      ))}
                    </span>
                  )}
                </td>
                <td data-label="Last sign-in" className="px-3 py-3 whitespace-nowrap text-ink-2">{ago(u.lastSignInAt)}</td>
                <td data-label="Joined" className="px-5 py-3 whitespace-nowrap text-ink-2">{day(u.createdAt)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">No users match.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
