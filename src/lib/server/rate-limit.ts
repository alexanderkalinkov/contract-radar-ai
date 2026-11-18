import "server-only";
import { headers } from "next/headers";
import { adminClient } from "./admin";

/**
 * Fixed-window rate limits shared by every server instance (public.rate_limits, via rate_limit_hit()).
 * Falls back to a per-instance memory counter when the table isn't there yet or the database can't be
 * reached, so a missing migration never locks people out, and there's still a brake.
 */

const memory = new Map<string, { start: number; hits: number }>();

function memoryHit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const start = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const cur = memory.get(key);
  const hits = cur && cur.start === start ? cur.hits + 1 : 1;
  memory.set(key, { start, hits });
  if (memory.size > 10_000) memory.clear();
  return hits <= limit;
}

/** Counts one attempt for key. True while the caller is within limit attempts per window. */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = adminClient();
  if (db) {
    const { data, error } = await db.rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
    if (!error && typeof data === "boolean") return data;
  }
  return memoryHit(key, limit, windowSeconds);
}

/** All of the limits must pass. Every one is counted, so a burst can't dodge one by failing another first. */
export async function allowAll(checks: [key: string, limit: number, windowSeconds: number][]): Promise<boolean> {
  const results = await Promise.all(checks.map(([k, l, w]) => allow(k, l, w)));
  return results.every(Boolean);
}

/** The caller's IP as Vercel reports it (x-real-ip / first x-forwarded-for hop). */
export function clientIp(h: Headers): string {
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function requestIp(): Promise<string> {
  return clientIp(await headers());
}

export const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";
