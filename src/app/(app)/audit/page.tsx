"use client";

import { useCallback, useEffect, useState } from "react";
import { btnGhost, Card, PageHeader, Segmented } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { describeAction, type AuditEntry } from "@/lib/enterprise/types";
import { canApproveRenewals } from "@/lib/roles";

type Filter = "all" | "contract" | "member" | "invite" | "renewal_review" | "sso";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "contract", label: "Contracts" },
  { value: "renewal_review", label: "Approvals" },
  { value: "member", label: "People" },
  { value: "invite", label: "Invites" },
  { value: "sso", label: "SSO" },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Short, readable summary of an entry's details (changed fields, role, file). */
function detailText(e: AuditEntry): string {
  const d = e.details ?? {};
  const changes = d.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  const show = (v: unknown) => (v == null || v === "" ? "empty" : typeof v === "string" ? (/^[0-9a-f-]{36}$/.test(v) ? "set" : v) : JSON.stringify(v));
  if (changes) {
    return Object.entries(changes)
      .map(([k, v]) => `${k.replace(/_id$/, "").replace(/_/g, " ")}: ${show(v.from)} → ${show(v.to)}`)
      .join("; ");
  }
  return Object.entries(d)
    .filter(([k]) => k !== "department_id")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${show(v)}`)
    .join("; ");
}

export default function AuditPage() {
  const ws = useWorkspace();
  const [filter, setFilter] = useState<Filter>("all");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const allowed = ws.mode === "cloud" && canApproveRenewals(ws.role);

  const load = useCallback(
    async (before?: number) => {
      setLoading(true);
      const qs = new URLSearchParams({ limit: "100" });
      if (filter !== "all") qs.set("type", filter);
      if (before) qs.set("before", String(before));
      const res = await fetch(`/api/audit?${qs}`);
      const json = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) return setError(json.error ?? "Could not load the audit log.");
      setError(null);
      setEntries((prev) => (before ? [...prev, ...json.entries] : json.entries));
      setNext(json.next);
    },
    [filter],
  );
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  return (
    <>
      <PageHeader eyebrow="Who did what, and when. Kept for as long as the workspace exists." title="Audit log">
        {allowed && (
          <a href="/api/audit?format=csv&days=365" className={btnGhost}>
            Export last 12 months (CSV)
          </a>
        )}
      </PageHeader>

      {ws.mode === "demo" ? (
        <Card className="p-5 text-sm text-ink-2">The audit log needs a shared workspace (Supabase). Demo mode keeps no history.</Card>
      ) : !allowed ? (
        <Card label="Admins and approvers only" className="p-5 text-sm text-ink-2">The audit log is for admins and approvers.</Card>
      ) : (
        <>
          <Segmented value={filter} onChange={setFilter} options={FILTERS} label="Show" />
          {error && <p className="m-0 rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3 text-[13px] text-warn-text">{error}</p>}
          <Card label="Events" className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-muted uppercase">
                  <th scope="col" className="px-5 py-3 font-semibold">When</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Who</th>
                  <th scope="col" className="px-3 py-3 font-semibold">What</th>
                  <th scope="col" className="px-3 py-3 font-semibold">On</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-line-soft align-top">
                    <td className="px-5 py-3 whitespace-nowrap text-muted">{when(e.created_at)}</td>
                    <td className="px-3 py-3">{e.actor_email ?? "system"}</td>
                    <td className="px-3 py-3 font-semibold">{describeAction(e.action)}</td>
                    <td className="px-3 py-3">{e.target_label ?? "—"}</td>
                    <td className="max-w-[360px] px-5 py-3 text-[13px] break-words text-ink-2">{detailText(e) || "—"}</td>
                  </tr>
                ))}
                {!loading && entries.length === 0 && !error && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-muted">Nothing logged yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          {next && (
            <button type="button" className={`${btnGhost} self-start`} disabled={loading} onClick={() => load(next)}>
              {loading ? "Loading…" : "Show older"}
            </button>
          )}
        </>
      )}
    </>
  );
}
