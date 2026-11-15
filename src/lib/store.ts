"use client";

// Tiny browser-only store so clicks in the demo stick across pages.
// It stands in for the database until there is a backend.
import { useCallback, useEffect, useState } from "react";

export type OppStatus = "open" | "in_progress" | "won" | "dismissed" | "snoozed";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("cr-store", { detail: key }));
  } catch {
    /* storage unavailable: state stays in memory */
  }
}

export function useStored<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    setValue(read(key, fallback));
    const onChange = (e: Event) => {
      if ((e as CustomEvent).detail === key) setValue(read(key, fallback));
    };
    window.addEventListener("cr-store", onChange);
    return () => window.removeEventListener("cr-store", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      write(key, v);
    },
    [key],
  );
  return [value, set];
}

export function useOppStatus() {
  const [map, setMap] = useStored<Record<string, OppStatus>>("cr-opp-status", {});
  const statusOf = (id: string): OppStatus => map[id] ?? "open";
  const setStatus = (id: string, s: OppStatus) => setMap({ ...map, [id]: s });
  const reset = () => setMap({});
  return { statusOf, setStatus, reset };
}

export function useSources(defaults: Record<string, boolean>) {
  return useStored<Record<string, boolean>>("cr-sources", defaults);
}
