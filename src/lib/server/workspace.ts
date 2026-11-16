import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

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
  role: "owner" | "member";
}

export interface SessionInfo {
  userId: string;
  email: string;
  workspace: Workspace;
  role: "owner" | "member";
  /** Every workspace this person belongs to, newest first. */
  workspaces: WorkspaceChoice[];
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

  return {
    userId,
    email: String(claims.claims.email ?? ""),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      show_sample_data: workspace.show_sample_data,
      onboarded_at: workspace.onboarded_at ?? null,
      is_demo: Boolean(workspace.is_demo),
    },
    role: (chosen?.role as "owner" | "member") ?? "member",
    workspaces: memberships.map((m) => ({
      id: m.workspaces!.id,
      name: m.workspaces!.name,
      is_demo: Boolean(m.workspaces!.is_demo),
      role: m.role as "owner" | "member",
    })),
  };
});
