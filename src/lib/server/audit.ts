import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface AuditEvent {
  /** Dotted verb, e.g. "contract.file_opened", "renewal.approved", "audit.exported". */
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, unknown>;
}

/**
 * Records an event the database can't see on its own. Data changes (contracts, members, invites,
 * departments, tools, entities, SSO) are logged by triggers already, so don't log those twice.
 * Never throws: a missing audit table (migration not run yet) must not break the action itself.
 */
export async function logAudit(supabase: Client, workspaceId: string, e: AuditEvent): Promise<void> {
  try {
    await supabase.rpc("log_audit", {
      ws: workspaceId,
      action: e.action,
      target_type: e.targetType ?? null,
      target_id: e.targetId ?? null,
      target_label: e.targetLabel ?? null,
      details: e.details ?? {},
    });
  } catch {
    // ignore
  }
}

/** One "signed in" row in each of the user's workspaces. */
export async function logSignIn(supabase: Client, method: "password" | "sso" | "email_link"): Promise<void> {
  try {
    await supabase.rpc("log_sign_in", { method });
  } catch {
    // ignore
  }
}
