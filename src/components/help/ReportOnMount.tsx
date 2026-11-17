"use client";

import { useEffect } from "react";
import { reportError } from "./ErrorTrail";

/** Logs a 404 (or other page-level problem) once when the page shows. */
export function ReportOnMount({ kind, message, status }: { kind: "not_found" | "crash"; message: string; status?: number }) {
  useEffect(() => {
    reportError({ kind, message, status, details: document.referrer ? { referrer: document.referrer.slice(0, 300) } : undefined });
  }, [kind, message, status]);
  return null;
}
