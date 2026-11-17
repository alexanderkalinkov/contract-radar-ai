import "server-only";
import { adminClient } from "./admin";

export type AppErrorKind = "api" | "upload" | "crash" | "not_found" | "server";

export interface AppError {
  kind: AppErrorKind;
  message: string;
  status?: number | null;
  page?: string | null;
  endpoint?: string | null;
  userId?: string | null;
  email?: string | null;
  workspaceId?: string | null;
  browser?: string | null;
  details?: Record<string, unknown>;
}

const clip = (v: string | null | undefined, max: number) => (v ? String(v).slice(0, max) : null);

/**
 * Records a problem someone ran into, for /admin → Setup & health. Never throws, so logging can't
 * break the request that failed. Quietly does nothing before the error-log SQL has been run.
 */
export async function recordAppError(e: AppError): Promise<void> {
  const db = adminClient();
  if (!db) return;
  try {
    await db.from("app_errors").insert({
      kind: e.kind,
      message: clip(e.message, 1000) ?? "Unknown error",
      status: e.status ?? null,
      page: clip(e.page, 300),
      endpoint: clip(e.endpoint, 300),
      user_id: e.userId ?? null,
      email: clip(e.email, 200),
      workspace_id: e.workspaceId ?? null,
      browser: clip(e.browser, 400),
      details: e.details ?? {},
    });
  } catch {
    /* ignore */
  }
}
