"use client";

import { useEffect } from "react";

const KEY = "cr-error-trail";
const MAX = 5;

/** The last few errors this tab hit, so a support message can say what broke. Stays in this tab only. */
export function readErrorTrail(): string[] {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function push(line: string) {
  try {
    const list = readErrorTrail();
    list.push(`${new Date().toISOString().slice(11, 19)} ${window.location.pathname}: ${line}`.slice(0, 400));
    window.sessionStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* storage unavailable */
  }
}

type Report = { kind: "api" | "upload" | "crash" | "not_found"; message: string; status?: number; endpoint?: string; details?: Record<string, unknown> };

const sentAt = new Map<string, number>();
let rawFetch: typeof fetch | null = null;

/**
 * Sends a problem to the error log in /admin → Setup & health. The same problem is sent at most once
 * every 30 seconds per tab, and reporting never throws.
 */
export function reportError(r: Report) {
  try {
    const key = `${r.kind}|${r.status ?? ""}|${r.endpoint ?? ""}|${r.message}`;
    const now = Date.now();
    if (now - (sentAt.get(key) ?? 0) < 30_000) return;
    sentAt.set(key, now);
    const body = JSON.stringify({
      ...r,
      message: r.message.slice(0, 1000),
      page: window.location.pathname + window.location.search,
      browser: `${navigator.userAgent} · ${window.innerWidth}x${window.innerHeight} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    });
    (rawFetch ?? window.fetch)("/api/errors", { method: "POST", headers: { "content-type": "application/json", "x-cr-background": "1" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

const urlOf = (input: RequestInfo | URL) => (typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
const SKIP = ["/api/errors", "/api/support"];

/**
 * Mounted once for the whole site. Records uncaught errors and failed API calls in this tab's trail
 * (sent with support messages) and in the error log platform admins see.
 */
export function ErrorTrail() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const msg = e.message || "Script error";
      push(msg);
      reportError({ kind: "crash", message: msg, details: { source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined } });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e.reason as Error)?.message ?? e.reason ?? "Unhandled rejection");
      push(msg);
      // Failed fetches (offline, blocked) show up here too; they're worth knowing about.
      reportError({ kind: "crash", message: msg, details: { unhandledRejection: true } });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const original = window.fetch;
    rawFetch = original;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      try {
        const full = new URL(urlOf(input), window.location.href);
        const isApi = full.origin === window.location.origin && full.pathname.startsWith("/api/");
        if (isApi && res.status >= 400 && res.status !== 401 && !SKIP.some((p) => full.pathname.startsWith(p))) {
          if (res.status >= 500) push(`${res.status} from ${full.pathname}`);
          let message = `${res.status} ${res.statusText || "error"}`;
          try {
            const json = (await res.clone().json()) as { error?: unknown; message?: unknown };
            const m = json?.error ?? json?.message;
            if (typeof m === "string" && m) message = m;
          } catch {
            /* not JSON */
          }
          reportError({ kind: "api", status: res.status, endpoint: `${(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()} ${full.pathname}`, message });
        }
      } catch {
        /* never let logging break the call */
      }
      return res;
    };
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.fetch = original;
      rawFetch = null;
    };
  }, []);
  return null;
}
