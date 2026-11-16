import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

/** Remembers which workspace a person picked when they belong to more than one (e.g. their own and the demo). */
export const WORKSPACE_COOKIE = "cr_workspace";

export interface Workspace {
  id: string;
  name: string;
  show_sample_data: boolean;
  onboarded_at?: string | null;
  is_demo?: boolean;
}

export interface WorkspaceChoice {
  id: string;
  name: string;
  is_demo: boolean;
  role: Role;
}

export interface SessionInfo {
  userId: string;
  email: string;
  workspace: Workspace;
  role: Role;
  /** Every workspace this person belongs to, newest first. */
  workspaces: WorkspaceChoice[];
  /** Their company requires SSO but this session signed in another way: the app sends them to SSO sign-in. */
  ssoRequired?: boolean;
  /** This session signed in through SAML SSO. */
  viaSso?: boolean;
  /** Profile basics kept in Supabase Auth user metadata (Account page). */
  name: string;
  jobTitle: string;
  /** They've watched or dismissed the onboarding tour, so it doesn't open by itself again. */
  tourSeen: boolean;
}

/** True when the token says the person signed in through SAML SSO. */
function signedInWithSso(claims: Record<string, unknown>): boolean {
  const amr = claims.amr;
  return Array.isArray(amr) && amr.some((a) => typeof a === "object" && a !== null && String((a as { method?: unknown }).method).startsWith("sso"));
}

type MemberRow = { role: string; created_at: string; workspaces: (Workspace & { created_at?: string }) | null };

/**
 * The signed-in user and their workspace, or null when signed out or in demo mode.
 * bootstrap_workspace() accepts pending invites and creates a first workspace if needed.
 * With several workspaces, the one picked in the switcher (a cookie) wins; otherwise the newest
 * real workspace, so a demo workspace never becomes someone's default by accident.
 */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data: ws, error } = await supabase.rpc("bootstrap_workspace");
  if (error || !ws) {
    throw new Error(
      `Could not load your workspace (${error?.message ?? "no data"}). Has the database migration in supabase/migrations been run?`,
    );
  }
  const boot = ws as Workspace;

  // select("*") on workspaces so this keeps working before the demo-workspace migration adds is_demo.
  const { data: rows } = await supabase
    .from("workspace_members")
    .select("role, created_at, workspaces(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const memberships = ((rows ?? []) as unknown as MemberRow[]).filter((r) => r.workspaces);

  const picked = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const chosen =
    memberships.find((m) => m.workspaces!.id === picked) ??
    (boot.is_demo ? memberships.find((m) => !m.workspaces!.is_demo) : undefined) ??
    memberships.find((m) => m.workspaces!.id === boot.id) ??
    memberships[0];
  const workspace = chosen?.workspaces ?? boot;

  const email = String(claims.claims.email ?? "");
  let ssoRequired = false;
  const viaSso = signedInWithSso(claims.claims as Record<string, unknown>);
  if (email && !viaSso) {
    // Fails quietly before the enterprise migration has run.
    const { data: required } = await supabase.rpc("sso_required", { email });
    ssoRequired = required === true;
  }

  const meta = (claims.claims.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  return {
    userId,
    email,
    ssoRequired,
    viaSso,
    name: str(meta.full_name) || str(meta.name),
    jobTitle: str(meta.job_title),
    tourSeen: Boolean(meta.tour_seen_at),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      show_sample_data: workspace.show_sample_data,
      onboarded_at: workspace.onboarded_at ?? null,
      is_demo: Boolean(workspace.is_demo),
    },
    role: (chosen?.role as Role) ?? "member",
    workspaces: memberships.map((m) => ({
      id: m.workspaces!.id,
      name: m.workspaces!.name,
      is_demo: Boolean(m.workspaces!.is_demo),
      role: m.role as Role,
    })),
  };
});
