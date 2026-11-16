import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/admin";
import { requireSession } from "@/lib/server/api";
import { inboundDomain, isInboundConfigured, workspaceInbox } from "@/lib/server/inbound";

export const dynamic = "force-dynamic";

export interface InboxInfo {
  configured: boolean;
  /** false until the email-inbox SQL has been run. */
  ready: boolean;
  address: string | null;
  canRotate: boolean;
  recent: { id: string; from_email: string | null; subject: string | null; status: string; detail: string | null; contract_ids: string[]; created_at: string }[];
}

/** The workspace's inbox address and the last emails it received. */
export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const ws = ctx.session.workspace;
  const [w, r] = await Promise.all([
    ctx.supabase.from("workspaces").select("name, inbox_token").eq("id", ws.id).single(),
    ctx.supabase
      .from("inbound_emails")
      .select("id, from_email, subject, status, detail, contract_ids, created_at")
      .eq("workspace_id", ws.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const ready = !w.error && !r.error;
  const info: InboxInfo = {
    configured: isInboundConfigured(),
    ready,
    address: ready ? workspaceInbox(w.data!.name, w.data!.inbox_token) : null,
    canRotate: ctx.session.role === "owner",
    recent: (r.data ?? []) as InboxInfo["recent"],
  };
  return NextResponse.json(info);
}

/** { op: "rotate" }: gives the workspace a new address. The old one stops working at once. Admins only. */
export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => ({}))) as { op?: string };
  if (body.op !== "rotate") return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
  if (ctx.session.role !== "owner") return NextResponse.json({ error: "Only workspace admins can change the inbox address." }, { status: 403 });
  const db = adminClient();
  if (!db || !inboundDomain()) return NextResponse.json({ error: "The email inbox isn't set up on this server yet." }, { status: 503 });
  const { data: token, error: tErr } = await db.rpc("new_inbox_token");
  if (tErr || typeof token !== "string") return NextResponse.json({ error: tErr?.message ?? "Couldn't make a new address." }, { status: 500 });
  const { data, error } = await db.from("workspaces").update({ inbox_token: token }).eq("id", ctx.session.workspace.id).select("name, inbox_token").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't save the new address." }, { status: 500 });
  return NextResponse.json({ ok: true, address: workspaceInbox(data.name, data.inbox_token) });
}
