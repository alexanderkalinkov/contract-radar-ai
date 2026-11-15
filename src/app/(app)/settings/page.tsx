import { PageHeader } from "@/components/ui";
import { TeamSettings, type Invite, type Member } from "@/components/TeamSettings";
import { getSession } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  let members: Member[] = [];
  let invites: Invite[] = [];
  if (session) {
    const supabase = await createClient();
    const [m, i] = await Promise.all([
      supabase.from("workspace_members").select("user_id, email, role, created_at").eq("workspace_id", session.workspace.id).order("created_at"),
      supabase.from("workspace_invites").select("id, email, created_at").eq("workspace_id", session.workspace.id).order("created_at"),
    ]);
    members = (m.data ?? []) as Member[];
    invites = (i.data ?? []) as Invite[];
  }
  return (
    <>
      <PageHeader eyebrow="Who can see this workspace, and what it shows" title="Workspace" />
      <TeamSettings members={members} invites={invites} currentUserId={session?.userId ?? null} />
    </>
  );
}
