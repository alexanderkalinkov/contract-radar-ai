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

/** Mounted once in the app layout. Records uncaught errors and failed API calls (status 500+). */
export function ErrorTrail() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => push(e.message || "Script error");
    const onRejection = (e: PromiseRejectionEvent) => push(String((e.reason as Error)?.message ?? e.reason ?? "Unhandled rejection"));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      if (res.status >= 500) {
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].pathname : (args[0] as Request).url;
        if (!String(url).includes("/api/support")) push(`${res.status} from ${String(url).split("?")[0]}`);
      }
      return res;
    };
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.fetch = original;
    };
  }, []);
  return null;
}
