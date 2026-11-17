import Link from "next/link";
import { notFound } from "next/navigation";
import { btnGhost, Card, PageHeader } from "@/components/ui";
import { Pill, Th, when } from "@/components/admin/bits";
import { getPlatformCtx } from "@/lib/server/platform";
import { workspaceNames } from "@/lib/server/platform-data";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  workspace_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const clean = (s: string) => s.replace(/[%,()*]/g, "").trim().slice(0, 80);

function detail(d: Record<string, unknown> | null): string {
  if (!d) return "";
  const changes = d.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  const show = (v: unknown) => (v == null || v === "" ? "empty" : typeof v === "string" ? v : JSON.stringify(v));
  if (changes) return Object.entries(changes).map(([k, v]) => `${k}: ${show(v.from)} → ${show(v.to)}`).join("; ");
  return Object.entries(d)
    .filter(([k]) => k !== "by")
    .map(([k, v]) => `${k}: ${show(v)}`)
    .join("; ");
}

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ source?: string; ws?: string; q?: string; actor?: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const sp = await searchParams;
  const source = sp.source === "admin" ? "admin" : "all";
  const ws = sp.ws && /^[0-9a-f-]{36}$/.test(sp.ws) ? sp.ws : "";
  const q = clean(sp.q ?? "");
  const actor = clean(sp.actor ?? "");
  const names = await workspaceNames(ctx.db);

  let query = ctx.db
    .from(source === "admin" ? "platform_audit_log" : "audit_log")
    .select("id, workspace_id, actor_email, action, target_type, target_label, details, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (ws) query = query.eq("workspace_id", ws);
  if (q) query = query.or(`action.ilike.%${q}%,target_label.ilike.%${q}%`);
  if (actor) query = query.ilike("actor_email", `%${actor}%`);
  const { data, error } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Audit log" />
      <form action="/admin/audit" className="flex flex-wrap items-center gap-2">
        <select name="source" defaultValue={source} aria-label="Which log" className="min-h-11 rounded-[10px] border border-[#D0D5DD] bg-white px-2 text-sm">
          <option value="all">Every workspace</option>
          <option value="admin">Platform admin actions</option>
        </select>
        <select name="ws" defaultValue={ws} aria-label="Workspace" className="min-h-11 max-w-[220px] rounded-[10px] border border-[#D0D5DD] bg-white px-2 text-sm">
          <option value="">All workspaces</option>
          {[...names.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => (
            <option key={id} value={id}>{n}</option>
          ))}
        </select>
        <input name="q" defaultValue={q} placeholder="Action or target" aria-label="Action or target" className="min-h-11 w-44 rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm" />
        <input name="actor" defaultValue={actor} placeholder="Who (email)" aria-label="Who" className="min-h-11 w-44 rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm" />
        <button type="submit" className={btnGhost}>Filter</button>
        <span className="text-sm text-muted">Latest {rows.length}</span>
      </form>
      {error && <p className="text-sm text-[#B42318]">Couldn&apos;t read the log: {error.message}</p>}

      <Card label="Audit entries" className="rtable-wrap overflow-x-auto">
        <table className="rtable w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <Th>When</Th>
              <Th>Who</Th>
              <Th>What</Th>
              <Th>Workspace</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line-soft align-top">
                <td data-label="When" className="px-5 py-3 whitespace-nowrap text-ink-2">{when(r.created_at)}</td>
                <td data-label="Who" className="px-3 py-3 text-ink-2">{r.actor_email ?? "system"}</td>
                <td data-label="What" className="rt-full px-3 py-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {r.action.startsWith("platform.") && <Pill tone="brand">Admin</Pill>}
                    <b>{r.action}</b>
                    {r.target_label && <span className="text-ink-2">· {r.target_label}</span>}
                  </span>
                </td>
                <td data-label="Workspace" className="px-3 py-3">
                  {r.workspace_id ? <Link href={`/admin/workspaces/${r.workspace_id}`} className="text-ink-2 hover:text-brand">{names.get(r.workspace_id) ?? "(deleted)"}</Link> : <span className="text-muted">—</span>}
                </td>
                <td data-label="Details" className="rt-full max-w-[360px] px-5 py-3 text-xs break-words text-muted">{detail(r.details)}</td>
              </tr>
            ))}
            {rows.length === 0 && !error && <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">No entries match.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
