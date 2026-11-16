"use client";

// Auto-discovery data: /api/discovery when signed in, sample results in demo mode.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useStored } from "@/lib/store";
import { useTeam } from "@/lib/team/useTeam";
import { buildItems, importDescription, importSeats } from "./build";
import { SAMPLE_ACCOUNT, SAMPLE_SIGNALS } from "./sample";
import { PROVIDERS, type DiscoveryData, type DiscoveryOp, type DiscoveryState, type ProviderId } from "./types";

interface DemoState {
  connected: ProviderId[];
  states: DiscoveryState[];
  synced: Partial<Record<ProviderId, string>>;
}

const EMPTY_DEMO: DemoState = { connected: [], states: [], synced: {} };

export interface Result {
  ok: boolean;
  error?: string;
  added?: number;
  linked?: number;
  summary?: { tools?: number };
}

export function useDiscovery() {
  const ws = useWorkspace();
  const team = useTeam();
  const [demo, setDemo] = useStored<DemoState>("cr-discovery-demo", EMPTY_DEMO);
  const [cloud, setCloud] = useState<(DiscoveryData & { aiMatching?: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (ws.mode !== "cloud") return;
    try {
      const res = await fetch("/api/discovery", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load discovered tools.");
      setCloud(json);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [ws.mode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const data = useMemo<(DiscoveryData & { aiMatching?: boolean }) | null>(() => {
    if (ws.mode === "cloud") return cloud;
    return {
      configured: Object.fromEntries(PROVIDERS.map((p) => [p.id, true])) as Record<ProviderId, boolean>,
      blockers: [],
      connections: demo.connected.map((p) => ({
        provider: p,
        status: "connected" as const,
        account_name: SAMPLE_ACCOUNT[p],
        last_synced_at: demo.synced[p] ?? null,
        last_error: null,
        summary: { tools: SAMPLE_SIGNALS[p].length },
      })),
      signals: demo.connected.flatMap((p) => SAMPLE_SIGNALS[p]),
      states: demo.states,
      aiMatching: false,
    };
  }, [ws.mode, cloud, demo]);

  const departments = useMemo(() => (team.raw?.departments ?? []).filter((d) => !d.sample), [team.raw]);
  const tools = useMemo(() => (team.raw?.tools ?? []).filter((t) => !t.sample), [team.raw]);
  const items = useMemo(() => (data ? buildItems(data, departments, tools) : null), [data, departments, tools]);

  /** Cloud: the browser goes to the provider and comes back. Demo: pretend it did. */
  const connect = useCallback(
    async (provider: ProviderId, returnTo: string): Promise<Result> => {
      if (ws.mode === "cloud") {
        window.location.href = `/api/connect/${provider}?return=${encodeURIComponent(returnTo)}`;
        return { ok: true };
      }
      await new Promise((r) => setTimeout(r, 700));
      setDemo({ ...demo, connected: Array.from(new Set([...demo.connected, provider])), synced: { ...demo.synced, [provider]: new Date().toISOString() } });
      return { ok: true, summary: { tools: SAMPLE_SIGNALS[provider].length } };
    },
    [ws.mode, demo, setDemo],
  );

  const sync = useCallback(
    async (provider: ProviderId): Promise<Result> => {
      if (ws.mode !== "cloud") {
        setDemo({ ...demo, synced: { ...demo.synced, [provider]: new Date().toISOString() } });
        return { ok: true, summary: { tools: SAMPLE_SIGNALS[provider].length } };
      }
      const res = await fetch(`/api/connect/${provider}`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as Result;
      await refresh();
      return res.ok ? json : { ok: false, error: json.error ?? "Sync failed." };
    },
    [ws.mode, demo, setDemo, refresh],
  );

  const disconnect = useCallback(
    async (provider: ProviderId): Promise<Result> => {
      if (ws.mode !== "cloud") {
        setDemo({ ...demo, connected: demo.connected.filter((p) => p !== provider) });
        return { ok: true };
      }
      const res = await fetch(`/api/connect/${provider}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as Result;
      await refresh();
      return res.ok ? { ok: true } : { ok: false, error: json.error ?? "Could not disconnect." };
    },
    [ws.mode, demo, setDemo, refresh],
  );

  const run = useCallback(
    async (op: DiscoveryOp): Promise<Result> => {
      if (ws.mode === "cloud") {
        const res = await fetch("/api/discovery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) });
        const json = (await res.json().catch(() => ({}))) as Result;
        await Promise.all([refresh(), op.op === "import" ? team.refresh() : null]);
        return res.ok && json.ok ? json : { ok: false, error: json.error ?? "Something went wrong." };
      }
      // Demo mode: keep review state in this browser; imports go into the demo team.
      const upsert = (states: DiscoveryState[], patch: Partial<DiscoveryState> & { vendor_key: string }) => {
        const prev = states.find((s) => s.vendor_key === patch.vendor_key) ?? { vendor_key: patch.vendor_key, status: "new" as const, department_id: null, department_set: false, tool_id: null };
        return [...states.filter((s) => s.vendor_key !== patch.vendor_key), { ...prev, ...patch }];
      };
      let states = demo.states;
      if (op.op === "dismiss") for (const k of op.vendor_keys) states = upsert(states, { vendor_key: k, status: "dismissed" });
      if (op.op === "restore") for (const k of op.vendor_keys) states = upsert(states, { vendor_key: k, status: "new", tool_id: null });
      if (op.op === "setDepartment") states = upsert(states, { vendor_key: op.vendor_key, department_id: op.department_id, department_set: true });
      let added = 0;
      let linked = 0;
      if (op.op === "import") {
        const wanted = new Map(op.items.map((i) => [i.vendor_key, i.department_id]));
        const chosen = (items ?? []).filter((i) => wanted.has(i.vendor_key) && i.status !== "imported");
        const fresh = chosen.filter((i) => !i.existing_tool_id);
        const newTools = fresh.map((i) => ({
          id: `disc-${i.vendor_key}-${Date.now()}`,
          name: i.name,
          category: i.category,
          department_id: wanted.get(i.vendor_key) ?? null,
          description: importDescription(i),
          annual_cost: i.annual_spend != null ? Math.round(i.annual_spend) : null,
          seats: importSeats(i),
        }));
        if (newTools.length) {
          const r = await team.run({ op: "importTools", tools: newTools });
          if (!r.ok) return r;
        }
        fresh.forEach((i, n) => (states = upsert(states, { vendor_key: i.vendor_key, status: "imported", tool_id: newTools[n].id })));
        chosen.filter((i) => i.existing_tool_id).forEach((i) => (states = upsert(states, { vendor_key: i.vendor_key, status: "imported", tool_id: i.existing_tool_id })));
        added = fresh.length;
        linked = chosen.length - fresh.length;
      }
      setDemo({ ...demo, states });
      return { ok: true, added, linked };
    },
    [ws.mode, demo, setDemo, refresh, team, items],
  );

  return {
    mode: ws.mode,
    data,
    items,
    departments,
    error: error ?? team.error,
    isAdmin: team.isAdmin,
    loading: !data || !team.raw,
    connect,
    sync,
    disconnect,
    run,
    refresh,
  };
}
