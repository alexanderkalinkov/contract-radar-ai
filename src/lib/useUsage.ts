"use client";

// Sign-in data for the whole app: the workspace's synced Google Workspace / Microsoft signals when signed in,
// the sample sources this browser "connected" in demo mode. `sample` is always the Northwind sample data,
// for the sample team only; it is never applied to the workspace's own contracts or tools.
import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { SAMPLE_SIGNALS } from "./discovery/sample";
import type { ProviderId, Signal } from "./discovery/types";
import { useStored } from "./store";
import { vendorUsage, type VendorUsage } from "./usage";

let cache: Signal[] | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(v: Signal[]) => void>();

/** Called by the discovery screen after a load or sync, so every view picks up new sign-in data. */
export function publishSignals(v: Signal[]) {
  cache = v;
  listeners.forEach((l) => l(v));
}

async function load() {
  inflight ??= fetch("/api/discovery", { cache: "no-store" })
    .then(async (res) => {
      const json = await res.json().catch(() => ({}));
      // No discovery tables yet, or not allowed: there's simply no sign-in data.
      publishSignals(res.ok && Array.isArray(json.signals) ? (json.signals as Signal[]) : []);
    })
    .catch(() => publishSignals([]))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const SAMPLE_USAGE = vendorUsage(Object.values(SAMPLE_SIGNALS).flat());

export function useUsage(): { live: Map<string, VendorUsage>; sample: Map<string, VendorUsage> } {
  const ws = useWorkspace();
  const [demo] = useStored<{ connected: ProviderId[] }>("cr-discovery-demo", { connected: [] });
  const [signals, setSignals] = useState<Signal[] | null>(cache);

  useEffect(() => {
    if (ws.mode !== "cloud") return;
    listeners.add(setSignals);
    if (cache == null) load();
    return () => {
      listeners.delete(setSignals);
    };
  }, [ws.mode]);

  const live = useMemo(() => {
    if (ws.mode === "cloud") return vendorUsage(signals ?? []);
    return vendorUsage((demo.connected ?? []).flatMap((p) => SAMPLE_SIGNALS[p] ?? []));
  }, [ws.mode, signals, demo]);

  return { live, sample: SAMPLE_USAGE };
}
