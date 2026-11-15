"use client";

// One place for "what contracts and findings does this workspace have":
// the sample portfolio (when shown) plus the contracts the team uploaded.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { CONTRACTS, OPPORTUNITIES, PORTFOLIO } from "./seed";
import { savedToContract, type SavedContract } from "./saved";
import { useStored } from "./store";
import type { ExtractionResult } from "./extraction";
import type { Contract, Opportunity } from "./types";

const LOCAL_KEY = "cr-uploads";

/** Demo-mode uploads written by older versions had no id; give them a stable one. */
function normaliseLocal(list: (ExtractionResult & Partial<SavedContract>)[]): SavedContract[] {
  return list.map((x) => ({
    ...x,
    id: x.id ?? `local-${x.fileName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`,
    hasFile: false,
    uploadedByEmail: x.uploadedByEmail ?? null,
  }));
}

let cloudCache: SavedContract[] | null = null;
const listeners = new Set<(v: SavedContract[]) => void>();
function publish(v: SavedContract[]) {
  cloudCache = v;
  listeners.forEach((l) => l(v));
}

export function useSavedContracts() {
  const ws = useWorkspace();
  const [local, setLocal] = useStored<(ExtractionResult & Partial<SavedContract>)[]>(LOCAL_KEY, []);
  const [cloud, setCloud] = useState<SavedContract[] | null>(cloudCache);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (ws.mode !== "cloud") return;
    try {
      const res = await fetch("/api/contracts", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load contracts");
      publish(json.contracts as SavedContract[]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [ws.mode]);

  useEffect(() => {
    if (ws.mode !== "cloud") return;
    listeners.add(setCloud);
    if (cloudCache == null) refresh();
    return () => {
      listeners.delete(setCloud);
    };
  }, [ws.mode, refresh]);

  const saved = ws.mode === "cloud" ? cloud ?? [] : normaliseLocal(local);
  const loading = ws.mode === "cloud" && cloud == null && !error;

  const add = useCallback(
    (s: SavedContract) => {
      if (ws.mode === "cloud") publish([s, ...(cloudCache ?? []).filter((x) => x.id !== s.id)]);
      else {
        const current = normaliseLocal(JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "[]"));
        setLocal([s, ...current.filter((x) => x.id !== s.id && x.fileName !== s.fileName)]);
      }
    },
    [ws.mode, setLocal],
  );

  const remove = useCallback(
    async (id: string) => {
      if (ws.mode === "cloud") {
        const res = await fetch(`/api/contracts/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
        publish((cloudCache ?? []).filter((x) => x.id !== id));
      } else {
        setLocal(normaliseLocal(local).filter((x) => x.id !== id));
      }
    },
    [ws.mode, local, setLocal],
  );

  return { saved, loading, error, refresh, add, remove };
}

export interface Portfolio {
  contracts: Contract[];
  opportunities: Opportunity[];
  saved: SavedContract[];
  showSample: boolean;
  loading: boolean;
  totals: { identifiedSavings: number; opportunityCount: number; capturedThisYear: number; wins: number; contractsTracked: number };
}

export function usePortfolio(): Portfolio {
  const ws = useWorkspace();
  const { saved, loading } = useSavedContracts();
  return useMemo(() => {
    const uploaded = saved.map(savedToContract);
    const showSample = ws.showSample;
    return {
      contracts: [...uploaded, ...(showSample ? CONTRACTS : [])],
      opportunities: showSample ? OPPORTUNITIES : [],
      saved,
      showSample,
      loading,
      totals: showSample
        ? { ...PORTFOLIO, contractsTracked: PORTFOLIO.contractsTracked + uploaded.length }
        : { identifiedSavings: 0, opportunityCount: 0, capturedThisYear: 0, wins: 0, contractsTracked: uploaded.length },
    };
  }, [saved, loading, ws.showSample]);
}
