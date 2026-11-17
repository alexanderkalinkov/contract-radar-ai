import Link from "next/link";
import { notFound } from "next/navigation";
import { btnGhost, Card, PageHeader } from "@/components/ui";
import { BillingPill, day, Pill, Th } from "@/components/admin/bits";
import { getPlatformCtx } from "@/lib/server/platform";
import { loadWorkspaces } from "@/lib/server/platform-data";

export const dynamic = "force-dynamic";

export default async function AdminWorkspaces({ searchParams }: { searchParams: Promise<{ q?: string; demo?: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const { q = "", demo = "" } = await searchParams;
  const all = await loadWorkspaces(ctx.db);
  const needle = q.trim().toLowerCase();
  const list = all.filter(
    (w) =>
      (!needle || w.id.toLowerCase().includes(needle) || w.name.toLowerCase().includes(needle) || w.admins.some((a) => a.includes(needle))) &&
      (demo === "all" || (/^[0-9a-f-]{8,}$/.test(needle) && w.id.includes(needle)) || (demo === "only" ? w.isDemo : !w.isDemo)),
  );

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Workspaces" />
      <form className="flex flex-wrap items-center gap-2" action="/admin/workspaces">
        <input name="q" defaultValue={q} placeholder="Name, admin email or id" aria-label="Search workspaces" className="min-h-11 w-full max-w-sm rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm" />
        <select name="demo" defaultValue={demo} aria-label="Demo workspaces" className="min-h-11 rounded-[10px] border border-[#D0D5DD] bg-white px-2 text-sm">
          <option value="">Real workspaces</option>
          <option value="only">Demo only</option>
          <option value="all">All</option>
        </select>
        <button type="submit" className={btnGhost}>Filter</button>
        <span className="text-sm text-muted">{list.length} of {all.length}</span>
      </form>

      <Card label="Workspaces" className="rtable-wrap overflow-x-auto">
        <table className="rtable w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <Th>Workspace</Th>
              <Th>Plan</Th>
              <Th className="text-right">People</Th>
              <Th className="text-right">Contracts</Th>
              <Th>Admins</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id} className="border-t border-line-soft align-top">
                <td className="rt-full px-5 py-3">
                  <Link href={`/admin/workspaces/${w.id}`} className="font-semibold text-ink">{w.name}</Link>
                  {w.isDemo && <span className="ml-2"><Pill tone="warn">Demo</Pill></span>}
                </td>
                <td data-label="Plan" className="px-3 py-3"><BillingPill billing={w.billing} /></td>
                <td data-label="People" className="px-3 py-3 text-right">{w.members}{w.invites ? <span className="text-muted"> +{w.invites} invited</span> : null}</td>
                <td data-label="Contracts" className="px-3 py-3 text-right">{w.contracts}</td>
                <td data-label="Admins" className="rt-full px-3 py-3 text-ink-2">{w.admins.join(", ") || "—"}</td>
                <td data-label="Created" className="px-5 py-3 whitespace-nowrap text-ink-2">{day(w.createdAt)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-muted">No workspaces match.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
