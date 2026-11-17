import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, H2, PageHeader } from "@/components/ui";
import { ActionButton, DeleteUser, RoleSelect } from "@/components/admin/AdminUi";
import { ago, Pill, UserStatusPill, when } from "@/components/admin/bits";
import { getPlatformCtx, isPlatformAdminEmailFromEnv } from "@/lib/server/platform";
import { loadUser } from "@/lib/server/platform-data";

export const dynamic = "force-dynamic";

type AuditRow = { id: number; action: string; target_label: string | null; created_at: string; workspace_id: string };

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const { id } = await params;
  const u = await loadUser(ctx.db, id);
  if (!u) notFound();
  const self = u.id === ctx.session.userId;
  const fromEnv = isPlatformAdminEmailFromEnv(u.email);
  const { data: activity } = await ctx.db
    .from("audit_log")
    .select("id, action, target_label, created_at, workspace_id")
    .eq("actor_id", u.id)
    .order("created_at", { ascending: false })
    .limit(15);
  const names = new Map(u.memberships.map((m) => [m.workspaceId, m.workspaceName]));

  const facts: [string, React.ReactNode][] = [
    ["Name", u.name || "—"],
    ["Signs in with", u.provider],
    ["Account created", when(u.createdAt)],
    ["Email confirmed", u.confirmedAt ? when(u.confirmedAt) : "Not yet"],
    ["Last sign-in", u.lastSignInAt ? `${when(u.lastSignInAt)} (${ago(u.lastSignInAt)})` : "Never"],
    ["Invited", u.invitedAt ? when(u.invitedAt) : "—"],
    ["User id", <code key="id" className="text-xs break-all">{u.id}</code>],
  ];

  return (
    <>
      <Link href="/admin/users" className="text-sm font-semibold text-brand">← All users</Link>
      <PageHeader eyebrow="User" title={u.email}>
        <UserStatusPill status={u.status} />
        {u.platformAdmin && <Pill tone="brand">Platform admin</Pill>}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card label="Account" className="flex flex-col gap-4 p-5">
          <H2>Account</H2>
          <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="m-0 text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card label="Actions" className="flex flex-col gap-4 p-5">
          <H2>Actions</H2>
          <div className="flex flex-wrap gap-2">
            <ActionButton payload={{ action: "user.reset_password", userId: u.id }} label="Send password reset" />
            {(u.status === "unconfirmed" || u.status === "invited") && (
              <ActionButton payload={{ action: "user.resend_invite", userId: u.id }} label="Resend sign-in link" tone="brand" />
            )}
            {!self &&
              (u.status === "disabled" ? (
                <ActionButton payload={{ action: "user.enable", userId: u.id }} label="Enable account" tone="brand" />
              ) : (
                <ActionButton payload={{ action: "user.disable", userId: u.id }} label="Disable account" confirm="Block sign-in?" tone="danger" />
              ))}
          </div>
          <div className="flex flex-col items-start gap-2 border-t border-line-soft pt-4">
            <span className="text-sm font-semibold">Platform admin access</span>
            {fromEnv ? (
              <span className="text-sm text-muted">Granted by PLATFORM_ADMIN_EMAILS in Vercel. Remove the email there to take it away.</span>
            ) : u.platformAdmin ? (
              !self && <ActionButton payload={{ action: "platform_admin.remove", userId: u.id }} label="Remove platform admin" confirm="Remove their console access?" tone="danger" />
            ) : (
              <ActionButton payload={{ action: "platform_admin.add", userId: u.id }} label="Make platform admin" confirm="Give them full access to every workspace?" />
            )}
            {self && <span className="text-sm text-muted">This is you.</span>}
          </div>
          {!self && (
            <div className="flex flex-col items-start gap-2 border-t border-line-soft pt-4">
              <DeleteUser userId={u.id} email={u.email} />
            </div>
          )}
        </Card>
      </div>

      <Card label="Workspaces" className="rtable-wrap overflow-x-auto">
        <div className="px-5 pt-5"><H2>Workspaces</H2></div>
        <table className="rtable w-full min-w-[640px] border-collapse text-sm">
          <tbody>
            {u.memberships.map((m) => (
              <tr key={m.workspaceId} className="border-t border-line-soft first:border-t-0">
                <td className="rt-full px-5 py-3">
                  <Link href={`/admin/workspaces/${m.workspaceId}`} className="font-semibold text-ink">{m.workspaceName}</Link>
                  {m.isDemo && <span className="ml-2"><Pill tone="warn">Demo</Pill></span>}
                </td>
                <td data-label="Role" className="px-3 py-3"><RoleSelect workspaceId={m.workspaceId} userId={u.id} role={m.role} /></td>
                <td className="rt-end px-5 py-3 text-right">
                  <ActionButton payload={{ action: "member.remove", workspaceId: m.workspaceId, userId: u.id }} label="Remove" confirm="Remove from workspace?" tone="danger" />
                </td>
              </tr>
            ))}
            {u.memberships.length === 0 && <tr><td className="px-5 py-4 text-muted">Not in any workspace.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card label="Recent activity" className="flex flex-col gap-3 p-5">
        <H2>Recent activity</H2>
        {(activity ?? []).length === 0 ? (
          <p className="m-0 text-sm text-muted">Nothing in the audit log yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
            {((activity ?? []) as AuditRow[]).map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span><b>{a.action}</b>{a.target_label && <span className="text-ink-2"> · {a.target_label}</span>} <span className="text-muted">in {names.get(a.workspace_id) ?? "another workspace"}</span></span>
                <span className="text-xs text-muted">{when(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
