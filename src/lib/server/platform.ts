import "server-only";
import { cache } from "react";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./admin";
import { getSession, type SessionInfo } from "./workspace";

/**
 * Platform admins run Outflow itself (the /admin console), across every workspace. This is a
 * different thing from a workspace's own Admin role. Someone is a platform admin when their email is in
 * PLATFORM_ADMIN_EMAILS (comma separated) or they have a row in public.platform_admins.
 * Every check runs on the server with the service role key; the browser only ever sees a yes/no.
 */

const envAdmins = () =>
  (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const isPlatformAdminEmailFromEnv = (email: string) => envAdmins().includes(email.trim().toLowerCase());

async function checkAdmin(session: SessionInfo | null): Promise<boolean> {
  if (!session?.email || session.ssoRequired) return false;
  if (isPlatformAdminEmailFromEnv(session.email)) return true;
  const db = adminClient();
  if (!db) return false;
  const { data, error } = await db.from("platform_admins").select("user_id").eq("user_id", session.userId).maybeSingle();
  return !error && Boolean(data);
}

/** True when the signed-in person is a platform admin. Cached for the request. */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const session = await getSession().catch(() => null);
  return checkAdmin(session);
});

export interface PlatformCtx {
  session: SessionInfo;
  db: SupabaseClient;
}

/** For server pages: the admin's session and a service-role client, or null (the page shows a 404). */
export async function getPlatformCtx(): Promise<PlatformCtx | null> {
  const session = await getSession().catch(() => null);
  if (!session || !(await checkAdmin(session))) return null;
  const db = adminClient();
  if (!db) return null;
  return { session, db };
}

/** For API routes. Answers 404 to everyone else so the console's existence isn't advertised. */
export async function requirePlatformAdmin(): Promise<PlatformCtx | NextResponse> {
  const session = await getSession().catch(() => null);
  if (!session || !(await checkAdmin(session))) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const db = adminClient();
  if (!db) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY isn't set on the server." }, { status: 503 });
  return { session, db };
}

export interface PlatformAction {
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  workspaceId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Records what a platform admin did, in platform_audit_log and, when it concerns a workspace, in that
 * workspace's own audit log too (as "platform.<action>", so its admins can see support touched it).
 * Never throws: logging must not undo the action.
 */
export async function logPlatformAction(ctx: PlatformCtx, a: PlatformAction): Promise<void> {
  const row = {
    actor_id: ctx.session.userId,
    actor_email: ctx.session.email,
    action: a.action.slice(0, 80),
    target_type: a.targetType ?? null,
    target_id: a.targetId ?? null,
    target_label: a.targetLabel?.slice(0, 200) ?? null,
    details: a.details ?? {},
  };
  try {
    await ctx.db.from("platform_audit_log").insert({ ...row, workspace_id: a.workspaceId ?? null });
  } catch {
    /* table missing: SQL not run yet */
  }
  if (a.workspaceId) {
    try {
      await ctx.db.from("audit_log").insert({ ...row, action: `platform.${a.action}`.slice(0, 80), workspace_id: a.workspaceId, details: { ...row.details, by: "platform_admin" } });
    } catch {
      /* ignore */
    }
  }
}

/** Records a scheduled job's run for the health panel. Never throws. */
export async function recordJobRun(job: string, ok: boolean, summary: Record<string, unknown> = {}, error?: string): Promise<void> {
  const db = adminClient();
  if (!db) return;
  try {
    await db.from("job_runs").upsert({ job, ok, summary, error: error ?? null, last_run_at: new Date().toISOString() }, { onConflict: "job" });
  } catch {
    /* ignore */
  }
}
