"use client";

import { useState } from "react";
import { Card, H2 } from "@/components/ui";
import { inputCls, Notice } from "@/components/team/forms";
import { useEntities } from "./useEntities";

/** On a saved contract: which entity and cost centre pays for it. Hidden until the workspace has entities. */
export function ContractBooking({ contractId }: { contractId: string }) {
  const { data, run, mode } = useEntities();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (mode !== "cloud" || !data || data.entities.length === 0) return null;
  const current = data.assignments[contractId] ?? { entity_id: null, cost_centre_id: null };
  const centres = data.costCentres.filter((c) => c.entity_id === current.entity_id);
  const entity = data.entities.find((e) => e.id === current.entity_id);

  async function save(entity_id: string | null, cost_centre_id: string | null) {
    const r = await run({ op: "assignContract", contract_id: contractId, entity_id, cost_centre_id });
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Could not save." });
  }

  return (
    <Card label="Booked to" className="flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <H2>Booked to</H2>
        <span className="text-[13px] text-muted">
          The entity and cost centre that pay for this contract{entity ? `, in ${entity.currency}` : ""}.
        </span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <div className="min-w-[200px] flex-1">
          <label htmlFor={`ent-${contractId}`} className="sr-only">Entity</label>
          <select
            id={`ent-${contractId}`}
            className={inputCls}
            disabled={!data.canAssign}
            value={current.entity_id ?? ""}
            onChange={(e) => save(e.target.value || null, null)}
          >
            <option value="">Parent organisation (no entity)</option>
            {data.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.currency})
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label htmlFor={`cc-${contractId}`} className="sr-only">Cost centre</label>
          <select
            id={`cc-${contractId}`}
            className={inputCls}
            disabled={!data.canAssign || !current.entity_id}
            value={current.cost_centre_id ?? ""}
            onChange={(e) => save(current.entity_id, e.target.value || null)}
          >
            <option value="">{current.entity_id ? (centres.length ? "No cost centre" : "No cost centres in this entity") : "Pick an entity first"}</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
                {c.name ? ` · ${c.name}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Notice msg={msg} />
    </Card>
  );
}
