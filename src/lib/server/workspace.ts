import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface Workspace {
  id: string;
  name: string;
  show_sample_data: boolean;
  onboarded_at?: string | null;
}

export interface SessionInfo {
  userId: string;
  email: string;
  workspace: Workspace;
  role: "owner" | "member";
}

/**
 * The signed-in user and their workspace, or null when signed out or in demo mode.
 * bootstrap_workspace() accepts pending invites and creates a first workspace if needed.
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
  const workspace = ws as Workspace;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", userId)
    .single();

  return {
    userId,
    email: String(claims.claims.email ?? ""),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      show_sample_data: workspace.show_sample_data,
      onboarded_at: workspace.onboarded_at ?? null,
    },
    role: (member?.role as "owner" | "member") ?? "member",
  };
});
