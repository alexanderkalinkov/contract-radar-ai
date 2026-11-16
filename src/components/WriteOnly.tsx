"use client";

import { canWrite } from "@/lib/roles";
import { useWorkspace } from "./WorkspaceProvider";

/** True when the signed-in person can change data (viewers are read only; demo mode is always editable). */
export function useCanWrite(): boolean {
  const ws = useWorkspace();
  return ws.mode === "demo" || canWrite(ws.role);
}

/** Renders children only for people who can change data, and the fallback (if any) for viewers. */
export function WriteOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <>{useCanWrite() ? children : fallback}</>;
}
