"use client";

import { useCallback, useEffect, useState } from "react";
import type { EntitiesData, EntityOp } from "@/lib/enterprise/types";
import { useWorkspace } from "../WorkspaceProvider";

/** Entities, cost centres and contract assignments for the current workspace (cloud only). */
export function useEntities() {
  const ws = useWorkspace();
  const [data, setData] = useState<EntitiesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/entities");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? "Could not load entities.");
    setError(null);
    setData(json as EntitiesData);
  }, []);
  useEffect(() => {
    if (ws.mode === "cloud") load();
  }, [ws.mode, ws.workspaceId, load]);

  const run = useCallback(
    async (op: EntityOp): Promise<{ ok: boolean; error?: string }> => {
      const res = await fetch("/api/entities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) });
      const json = await res.json().catch(() => ({ ok: false, error: "Something went wrong." }));
      if (json.ok) await load();
      return json;
    },
    [load],
  );

  return { data, error, run, mode: ws.mode };
}
