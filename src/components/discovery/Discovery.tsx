"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { btnGhost, btnPrimary, btnSoft, Card, cx, H2, Segmented, VendorLogo } from "@/components/ui";
import { DepartmentSelect, Notice } from "@/components/team/forms";
import { usd } from "@/lib/format";
import { PROVIDERS, providerName, type DiscoveredItem, type ProviderId } from "@/lib/discovery/types";
import { useDiscovery } from "@/lib/discovery/useDiscovery";

type Disc = ReturnType<typeof useDiscovery>;
type Msg = { ok: boolean; text: string } | null;

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

/** Reads ?connected= / ?connect_error= after the provider sends the admin back, then cleans the URL. */
export function useConnectResult(): [Msg, (m: Msg) => void] {
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    const u = new URL(window.location.href);
    const err = u.searchParams.get("connect_error");
    const ok = u.searchParams.get("connected");
    if (!err && !ok) return;
    if (err) setMsg({ ok: false, text: err });
    else {
      const found = Number(u.searchParams.get("found") ?? 0);
      setMsg({ ok: true, text: `Connected to ${providerName(ok as ProviderId)}. Found ${found} tool${found === 1 ? "" : "s"}.` });
    }
    ["connect_error", "connected", "found"].forEach((k) => u.searchParams.delete(k));
    window.history.replaceState(null, "", u.pathname + u.search);
  }, []);
  return [msg, setMsg];
}

export function ConnectionCards({ disc, returnTo, onMessage }: { disc: Disc; returnTo: string; onMessage: (m: Msg) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const data = disc.data;
  if (!data) return <p className="m-0 text-sm text-muted">Loading sources…</p>;

  const act = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; summary?: { tools?: number } }>, okText: (n?: number) => string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    onMessage(r.ok ? { ok: true, text: okText(r.summary?.tools) } : { ok: false, text: r.error ?? "Something went wrong." });
  };

  return (
    <div className="flex flex-col gap-3">
      {data.blockers.map((b) => (
        <p key={b} className="m-0 rounded-[10px] border border-warn-line bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn-text">{b}</p>
      ))}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
        {PROVIDERS.map((p) => {
          const c = data.connections.find((x) => x.provider === p.id);
          const configured = data.configured[p.id];
          const b = busy?.endsWith(p.id) ? busy : null;
          return (
            <div
              key={p.id}
              className={cx(
                "flex flex-col gap-3 rounded-xl border px-4 py-3.5",
                c?.status === "connected" ? "border-good-line bg-[#F6FEF9]" : c?.status === "error" ? "border-warn-line bg-warn-soft" : "border-line bg-white",
              )}
            >
              <div className="flex items-start gap-3">
                <VendorLogo initials={p.initials} hue={p.hue} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="text-xs text-muted">
                    {b === `connect-${p.id}`
                      ? "Opening sign-in…"
                      : b === `sync-${p.id}`
                        ? "Syncing…"
                        : c
                          ? `${c.account_name ?? "Connected"} · synced ${ago(c.last_synced_at)}${c.summary?.tools != null ? ` · ${c.summary.tools} found` : ""}`
                          : p.what}
                  </span>
                  {c?.status === "error" && c.last_error && <span className="text-xs font-medium text-warn-text">{c.last_error}</span>}
                </div>
              </div>
              {!disc.isAdmin ? (
                <span className="text-xs text-muted">{c ? "Connected by an admin" : "An admin can connect this"}</span>
              ) : c ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnSoft}
                    disabled={Boolean(busy)}
                    onClick={() => act(`sync-${p.id}`, () => disc.sync(p.id), (n) => `${p.name} synced. ${n ?? 0} tools found.`)}
                  >
                    Sync now
                  </button>
                  {c.status === "error" && (
                    <button type="button" className={btnSoft} disabled={Boolean(busy)} onClick={() => disc.connect(p.id, returnTo)}>
                      Reconnect
                    </button>
                  )}
                  <button
                    type="button"
                    className="min-h-10 rounded-[9px] px-3 text-[13px] font-semibold text-muted hover:bg-chip"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      if (window.confirm(`Disconnect ${p.name}? Its sign-in and everything it found are deleted. Tools already added stay.`))
                        act(`disc-${p.id}`, () => disc.disconnect(p.id), () => `${p.name} disconnected and its data deleted.`);
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              ) : configured ? (
                <button
                  type="button"
                  className={cx(btnPrimary, "min-h-10 w-fit text-[13px]")}
                  disabled={Boolean(busy) || data.blockers.length > 0}
                  onClick={() => act(`connect-${p.id}`, () => disc.connect(p.id, returnTo), (n) => `Connected to ${p.name}. Found ${n ?? 0} tools.`)}
                >
                  Connect {p.name.split(" ")[0]}
                </button>
              ) : (
                <span className="text-xs text-muted">
                  <span className="mr-1.5 rounded-full bg-chip px-2 py-0.5 font-semibold">Needs setup</span>
                  Add its app keys to the server. See <code>docs/auto-discovery-setup.md</code>.
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="m-0 text-xs text-muted">
        Read-only. Accounting: vendor, amount, date and expense account. Sign-ins: which apps people use and their department, never email or file
        content. {disc.mode === "demo" && "Demo mode: connecting loads sample results."}
      </p>
    </div>
  );
}

type View = "new" | "imported" | "dismissed";

export function DiscoveryReview({ disc, compact = false }: { disc: Disc; compact?: boolean }) {
  const [view, setView] = useState<View>("new");
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [dept, setDept] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const items = useMemo(() => disc.items ?? [], [disc.items]);
  const rows = items.filter((i) => i.status === view);
  const fresh = items.filter((i) => i.status === "new");
  // Default selection: everything new.
  const selected = picked ?? new Set(fresh.map((i) => i.vendor_key));
  const deptFor = (i: DiscoveredItem) => (i.vendor_key in dept ? dept[i.vendor_key] : i.department_id);
  const toImport = fresh.filter((i) => selected.has(i.vendor_key));

  if (!disc.items) return null;
  if (!items.length) {
    return (
      <p className="m-0 text-sm text-muted">
        Nothing found yet. Connect accounting or sign-in above, and the tools you pay for and use show up here for review.
      </p>
    );
  }

  const toggle = (k: string) => {
    const s = new Set(selected);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    setPicked(s);
  };

  async function importSelected() {
    setBusy(true);
    const r = await disc.run({ op: "import", items: toImport.map((i) => ({ vendor_key: i.vendor_key, department_id: deptFor(i) })) });
    setBusy(false);
    setPicked(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Could not add them." });
    const parts = [];
    if (r.added) parts.push(`Added ${r.added} tool${r.added === 1 ? "" : "s"} to Tools & survey`);
    if (r.linked) parts.push(`matched ${r.linked} to tools already on your list`);
    setMsg({ ok: true, text: `${parts.join(" and ")}. Department owners now see them as "Found: confirm" with the 4 questions.` });
  }

  async function dismissSelected() {
    setBusy(true);
    const r = await disc.run({ op: "dismiss", vendor_keys: toImport.map((i) => i.vendor_key) });
    setBusy(false);
    setPicked(null);
    setMsg(r.ok ? { ok: true, text: `Dismissed ${toImport.length}. Find them under Dismissed.` } : { ok: false, text: r.error ?? "Could not dismiss." });
  }

  const unassigned = toImport.filter((i) => !deptFor(i)).length;
  const total = fresh.reduce((s, i) => s + (i.annual_spend ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <H2>{fresh.length ? `${fresh.length} tools to review` : "All reviewed"}</H2>
          <span className="text-[13px] text-muted">
            {fresh.length
              ? `${total > 0 ? `${usd(total)} a year in spend. ` : ""}Check the department for each; its owner confirms the tool and answers 4 questions.`
              : "New tools appear here after each sync."}
          </span>
        </div>
        {!compact && (
          <Segmented<View>
            label="Show"
            value={view}
            onChange={(v) => {
              setView(v);
              setMsg(null);
            }}
            options={[
              { value: "new", label: `To review (${fresh.length})` },
              { value: "imported", label: `Added (${items.filter((i) => i.status === "imported").length})` },
              { value: "dismissed", label: `Dismissed (${items.filter((i) => i.status === "dismissed").length})` },
            ]}
          />
        )}
      </div>

      {disc.departments.length === 0 && view === "new" && (
        <p className="m-0 rounded-[10px] border border-warn-line bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn-text">
          Add your departments first (<Link href="/team" className="font-semibold underline">Team</Link> or setup) and each tool gets a suggested owner.
        </p>
      )}

      <div className="rtable-wrap overflow-x-auto rounded-xl border border-line-soft">
        <table className="rtable w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              {view === "new" && disc.isAdmin && (
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="h-4 w-4"
                    checked={fresh.length > 0 && selected.size === fresh.length}
                    onChange={(e) => setPicked(new Set(e.target.checked ? fresh.map((i) => i.vendor_key) : []))}
                  />
                </th>
              )}
              <th scope="col" className="px-4 py-3 font-semibold">Tool</th>
              <th scope="col" className="px-3 py-3 font-semibold">Found in</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Spend / yr</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">People</th>
              <th scope="col" className="px-4 py-3 font-semibold">Department</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.vendor_key} className="border-t border-line-soft align-top">
                {view === "new" && disc.isAdmin && (
                  <td className="rt-check px-4 py-3.5">
                    <input type="checkbox" className="h-4 w-4" aria-label={`Add ${i.name}`} checked={selected.has(i.vendor_key)} onChange={() => toggle(i.vendor_key)} />
                  </td>
                )}
                <td className="rt-full px-4 py-3.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">
                      {i.tool_id ? <Link href={`/tools/${i.tool_id}`} className="text-ink hover:text-brand">{i.name}</Link> : i.name}
                    </span>
                    <span className="text-[13px] text-muted">
                      {i.category}
                      {i.existing_tool_id && i.status === "new" && " · already on your list, will be matched"}
                    </span>
                  </div>
                </td>
                <td data-label="Found in" className="rt-full px-3 py-3.5">
                  <div className="flex flex-col gap-1">
                    {i.sources.map((s) => (
                      <span key={s.provider} className="text-[13px]">
                        <span className="mr-1.5 rounded-full bg-chip px-2 py-0.5 text-xs font-semibold text-ink-2">{providerName(s.provider).split(" ")[0]}</span>
                        <span className="text-muted">{s.evidence}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td data-label="Spend / yr" className="px-3 py-3.5 text-right font-semibold whitespace-nowrap">{i.annual_spend != null ? usd(i.annual_spend) : "—"}</td>
                <td data-label="People" className="px-3 py-3.5 text-right whitespace-nowrap">
                  {i.users != null ? i.users : "—"}
                  {i.licensed != null && <span className="block text-xs text-muted">of {i.licensed} paid</span>}
                </td>
                <td data-label="Department" className="rt-full px-4 py-3.5">
                  {view === "new" && disc.isAdmin ? (
                    <div className="flex min-w-[190px] flex-col gap-1">
                      <label className="sr-only" htmlFor={`d-${i.vendor_key}`}>Department for {i.name}</label>
                      <DepartmentSelect
                        id={`d-${i.vendor_key}`}
                        value={deptFor(i)}
                        departments={disc.departments}
                        onChange={(v) => {
                          setDept({ ...dept, [i.vendor_key]: v });
                          disc.run({ op: "setDepartment", vendor_key: i.vendor_key, department_id: v });
                        }}
                      />
                      <span className="text-xs text-muted">{i.vendor_key in dept ? "Set by you" : i.department_reason}</span>
                    </div>
                  ) : (
                    <span className="text-ink-2">{disc.departments.find((d) => d.id === deptFor(i))?.name ?? <span className="text-muted">Unassigned</span>}</span>
                  )}
                  {view === "dismissed" && disc.isAdmin && (
                    <button type="button" className="mt-1 block text-[13px] font-semibold text-brand" onClick={() => disc.run({ op: "restore", vendor_keys: [i.vendor_key] })}>
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">Nothing here.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Notice msg={msg} />
      {view === "new" && disc.isAdmin && fresh.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" className={btnPrimary} disabled={busy || !toImport.length} onClick={importSelected}>
            {busy ? "Adding…" : `Add ${toImport.length} to Tools & survey`}
          </button>
          <button type="button" className={btnGhost} disabled={busy || !toImport.length} onClick={dismissSelected}>
            Dismiss selected
          </button>
          {unassigned > 0 && <span className="text-[13px] text-warn">{unassigned} without a department: admins will see them under Unassigned.</span>}
        </div>
      )}
    </div>
  );
}

export function DiscoveryPage() {
  const disc = useDiscovery();
  const [msg, setMsg] = useConnectResult();
  if (disc.error) return <Card className="p-5 text-sm text-[#912018]">{disc.error}</Card>;
  return (
    <>
      <Card label="Sources" className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <H2>Connect accounting and sign-in</H2>
          <span className="text-[13px] text-muted">
            Accounting shows which software you pay for and how much. Sign-in data shows who uses it and which department they sit in, so each tool
            lands with the right owner.
            {disc.data?.aiMatching ? " Claude tidies vendor names and filters out non-software spend." : ""}
          </span>
        </div>
        <ConnectionCards disc={disc} returnTo="/discover" onMessage={setMsg} />
        <Notice msg={msg} />
      </Card>
      <Card label="Discovered tools" className="flex flex-col gap-4 p-5">
        {disc.loading ? <p className="m-0 text-sm text-muted">Loading…</p> : <DiscoveryReview disc={disc} />}
      </Card>
    </>
  );
}
