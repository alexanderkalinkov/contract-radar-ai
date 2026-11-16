import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDemoRows, DEMO_WORKSPACE_NAME } from "@/lib/demo/northwind";
import { adminClient } from "./admin";

// Creates and resets the demo workspace. Runs with the service role key, because ordinary users can't
// create workspaces or mark one as a demo (see supabase/migrations/20261116190000_demo_workspace.sql).

const NEEDS_MIGRATION = "Run supabase/migrations/20261116190000_demo_workspace.sql in the Supabase SQL editor first.";
const NEEDS_KEY = "The demo workspace needs SUPABASE_SERVICE_ROLE_KEY on the server (it's already set in Vercel for reminders; add it to .env.local to use it locally).";

function db(): SupabaseClient {
  const admin = adminClient();
  if (!admin) throw new Error(NEEDS_KEY);
  return admin;
}

function check(error: { message: string } | null, what: string) {
  if (!error) return;
  if (/is_demo/.test(error.message)) throw new Error(NEEDS_MIGRATION);
  throw new Error(`Couldn't ${what}: ${error.message}`);
}

/** The demo workspace this person belongs to, if any. */
export async function findDemoWorkspace(userId: string): Promise<string | null> {
  const { data, error } = await db()
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(id, is_demo)")
    .eq("user_id", userId)
    .eq("workspaces.is_demo", true)
    .limit(1);
  check(error, "look for a demo workspace");
  return (data?.[0]?.workspace_id as string | undefined) ?? null;
}

/** Makes a new demo workspace with this person as its admin, or returns the one they already have. */
export async function createDemoWorkspace(userId: string, email: string): Promise<{ id: string; created: boolean }> {
  const existing = await findDemoWorkspace(userId);
  if (existing) return { id: existing, created: false };
  const admin = db();
  const { data: ws, error } = await admin
    .from("workspaces")
    .insert({ ...workspaceSettings(), created_by: userId })
    .select("id")
    .single();
  check(error, "create the demo workspace");
  const id = ws!.id as string;
  const m = await admin.from("workspace_members").insert({ workspace_id: id, user_id: userId, email: email.toLowerCase(), role: "owner" });
  if (m.error) {
    await admin.from("workspaces").delete().eq("id", id);
    check(m.error, "add you to the demo workspace");
  }
  await seed(admin, id);
  return { id, created: true };
}

/** Deletes everything in a demo workspace and fills it again. Members stay. Only for is_demo workspaces and their admins. */
export async function resetDemoWorkspace(workspaceId: string, userId: string): Promise<void> {
  const admin = db();
  const { data: ws, error } = await admin.from("workspaces").select("id, is_demo").eq("id", workspaceId).maybeSingle();
  check(error, "load the workspace");
  if (!ws?.is_demo) throw new Error("Only a demo workspace can be reset.");
  const { data: me } = await admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (me?.role !== "owner") throw new Error("Only an admin of the demo workspace can reset it.");

  await wipe(admin, workspaceId);
  const upd = await admin.from("workspaces").update(workspaceSettings()).eq("id", workspaceId);
  check(upd.error, "reset the workspace settings");
  await seed(admin, workspaceId);
}

function workspaceSettings() {
  return {
    name: DEMO_WORKSPACE_NAME,
    is_demo: true,
    show_sample_data: false, // everything in the demo is real rows, so the sample overlay would double it
    renewal_alerts: false, // never email reminders about fictional contracts
    company_size: "200–499",
    onboarded_at: new Date().toISOString(),
  };
}

async function wipe(admin: SupabaseClient, ws: string) {
  // Files someone uploaded into the demo during a call.
  const files = await admin.storage.from("contracts").list(ws, { limit: 1000 });
  if (files.data?.length) await admin.storage.from("contracts").remove(files.data.map((f) => `${ws}/${f.name}`));
  // Children first where there is no cascade; the rest cascade from these.
  for (const table of ["renewal_alerts", "tool_surveys", "discovered_tools", "discovery_signals", "connections", "tools", "contracts", "workspace_invites"]) {
    const { error } = await admin.from(table).delete().eq("workspace_id", ws);
    check(error, `clear ${table}`);
  }
  const mem = await admin.from("workspace_members").update({ department_id: null }).eq("workspace_id", ws);
  check(mem.error, "clear member departments");
  const { error } = await admin.from("departments").delete().eq("workspace_id", ws);
  check(error, "clear departments");
}

async function seed(admin: SupabaseClient, ws: string) {
  // The demo never runs out of trial. Ignored if the billing table doesn't exist yet.
  await admin.from("workspace_billing").upsert({ workspace_id: ws, complimentary: true }, { onConflict: "workspace_id" });
  const today = new Date().toISOString().slice(0, 10);
  const rows = buildDemoRows(ws, today, randomUUID);
  const steps: [string, Record<string, unknown>[]][] = [
    ["departments", rows.departments],
    ["workspace_invites", rows.invites],
    ["contracts", rows.contracts],
    ["tools", rows.tools],
    ["tool_surveys", rows.surveys],
    ["connections", rows.connections],
    ["discovery_signals", rows.signals],
    ["discovered_tools", rows.discovered],
  ];
  for (const [table, list] of steps) {
    if (!list.length) continue;
    const { error } = await admin.from(table).insert(list);
    check(error, `add demo ${table.replace(/_/g, " ")}`);
  }
}
