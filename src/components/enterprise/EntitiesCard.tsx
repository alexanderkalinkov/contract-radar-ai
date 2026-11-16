"use client";

import { useState } from "react";
import { btnGhost, btnPrimary, Card, H2 } from "@/components/ui";
import { inputCls, Notice } from "@/components/team/forms";
import { CURRENCIES } from "@/lib/enterprise/types";
import { useEntities } from "./useEntities";

const money = (n: number, cur: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString("en-US")} ${cur}`;
  }
};
const spendLine = (s: Record<string, number> | undefined) =>
  s && Object.keys(s).length ? Object.entries(s).map(([cur, n]) => money(n, cur)).join(" + ") : "No contracts yet";

/** Workspace settings: the parent organisation's entities (brands, subsidiaries, regions) and their cost centres. */
export function EntitiesCard() {
  const { data, error, run, mode } = useEntities();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [cc, setCc] = useState<Record<string, { code: string; name: string }>>({});
  const say = (r: { ok: boolean; error?: string }, ok: string) => setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Something went wrong." });

  return (
    <Card label="Entities and cost centres" className="flex flex-col gap-4 p-5">
      <div className="flex max-w-[600px] flex-col gap-1">
        <H2>Entities and cost centres</H2>
        <span className="text-[13px] text-muted">
          This workspace is the parent organisation. Add each brand, subsidiary or region as an entity with its own currency, and the cost
          centres that pay for software there. Then book each contract to an entity and cost centre from the contract page.
        </span>
      </div>

      {mode === "demo" ? (
        <p className="m-0 text-sm text-ink-2">Entities need a shared workspace (Supabase).</p>
      ) : error ? (
        <p className="m-0 rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3 text-[13px] text-warn-text">{error}</p>
      ) : !data ? (
        <p className="m-0 text-sm text-muted">Loading…</p>
      ) : (
        <>
          {data.entities.length === 0 && <p className="m-0 text-sm text-muted">No entities yet. Everything counts toward the parent organisation.</p>}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {data.entities.map((e) => {
              const centres = data.costCentres.filter((c) => c.entity_id === e.id);
              const draft = cc[e.id] ?? { code: "", name: "" };
              return (
                <li key={e.id} className="flex flex-col gap-2.5 rounded-xl border border-line-soft p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {e.name}
                      {e.code && <span className="text-muted"> · {e.code}</span>}
                      <span className="ml-2 rounded-full bg-chip px-2 py-0.5 text-xs font-semibold text-ink-2">{e.currency}</span>
                    </span>
                    <span className="text-[13px] text-muted">{spendLine(data.spend[e.id])} / yr in contracts</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[13px]">
                    {centres.length === 0 && <span className="text-muted">No cost centres yet.</span>}
                    {centres.map((c) => (
                      <span key={c.id} className="flex items-center gap-1 rounded-full bg-chip px-3 py-1">
                        {c.code}
                        {c.name && <span className="text-muted">· {c.name}</span>}
                        {data.canManage && (
                          <button
                            type="button"
                            aria-label={`Delete cost centre ${c.code}`}
                            className="ml-1 text-muted hover:text-[#912018]"
                            onClick={async () => say(await run({ op: "deleteCostCentre", id: c.id }), `Deleted ${c.code}.`)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {data.canManage && (
                    <div className="flex flex-wrap gap-2">
                      <form
                        className="flex flex-[999_1_360px] flex-wrap gap-2"
                        onSubmit={async (ev) => {
                          ev.preventDefault();
                          const r = await run({ op: "addCostCentre", entity_id: e.id, code: draft.code, name: draft.name || null });
                          say(r, `Added ${draft.code} to ${e.name}.`);
                          if (r.ok) setCc({ ...cc, [e.id]: { code: "", name: "" } });
                        }}
                      >
                        <label className="sr-only" htmlFor={`cc-code-${e.id}`}>Cost centre code</label>
                        <input id={`cc-code-${e.id}`} className={`${inputCls} max-w-[140px]`} placeholder="CC-4100" value={draft.code} onChange={(x) => setCc({ ...cc, [e.id]: { ...draft, code: x.target.value } })} />
                        <label className="sr-only" htmlFor={`cc-name-${e.id}`}>Cost centre name</label>
                        <input id={`cc-name-${e.id}`} className={`${inputCls} min-w-[140px] flex-1`} placeholder="Name (optional)" value={draft.name} onChange={(x) => setCc({ ...cc, [e.id]: { ...draft, name: x.target.value } })} />
                        <button type="submit" className={btnGhost} disabled={!draft.code.trim()}>Add cost centre</button>
                      </form>
                      <button
                        type="button"
                        className={`${btnGhost} text-[#912018]`}
                        onClick={async () => {
                          if (!window.confirm(`Delete ${e.name} and its cost centres? Contracts booked to it become unassigned.`)) return;
                          say(await run({ op: "deleteEntity", id: e.id }), `Deleted ${e.name}.`);
                        }}
                      >
                        Delete entity
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {data.spend.none && data.entities.length > 0 && (
            <p className="m-0 text-[13px] text-muted">Not booked to an entity yet: {spendLine(data.spend.none)} / yr.</p>
          )}
          {data.canManage && (
            <form
              className="flex flex-wrap gap-2.5"
              onSubmit={async (ev) => {
                ev.preventDefault();
                const r = await run({ op: "addEntity", name, code: code || null, currency });
                say(r, `Added ${name}.`);
                if (r.ok) {
                  setName("");
                  setCode("");
                }
              }}
            >
              <label className="sr-only" htmlFor="ent-name">Entity name</label>
              <input id="ent-name" className={`${inputCls} min-w-[200px] flex-[2]`} placeholder="Brand or subsidiary, e.g. Paddy Power" value={name} onChange={(e) => setName(e.target.value)} />
              <label className="sr-only" htmlFor="ent-code">Short code</label>
              <input id="ent-code" className={`${inputCls} max-w-[110px]`} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
              <label className="sr-only" htmlFor="ent-cur">Currency</label>
              <select id="ent-cur" className={`${inputCls} max-w-[110px]`} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button type="submit" className={btnPrimary} disabled={!name.trim()}>Add entity</button>
            </form>
          )}
          {!data.canManage && <p className="m-0 text-[13px] text-muted">Only admins can add or change entities.</p>}
        </>
      )}
      <Notice msg={msg} />
    </Card>
  );
}
