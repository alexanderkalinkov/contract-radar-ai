import { after, NextResponse } from "next/server";
import { adminClient } from "@/lib/server/admin";
import { claimInbound, inboundDomain, processInbound, verifyWebhook, type ReceivedEvent } from "@/lib/server/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reading several contracts with Claude can take a while; it runs after the webhook has been answered.
export const maxDuration = 300;

// Resend calls this for every email sent to the inbox domain (event type email.received).
// Setup: docs/email-inbox-setup.md.
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const db = adminClient();
  if (!secret || !inboundDomain() || !db) {
    return NextResponse.json({ error: "Set RESEND_WEBHOOK_SECRET, INBOUND_EMAIL_DOMAIN and SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const body = await req.text();
  const bad = verifyWebhook(body, req.headers, secret);
  if (bad) return NextResponse.json({ error: bad }, { status: 401 });

  let event: ReceivedEvent;
  try {
    event = JSON.parse(body) as ReceivedEvent;
  } catch {
    return NextResponse.json({ error: "Body is not JSON." }, { status: 400 });
  }
  if (event.type !== "email.received" || !event.data?.email_id) return NextResponse.json({ ok: true, ignored: event.type });

  let logId: string | null;
  try {
    logId = await claimInbound(db, event);
  } catch (e) {
    // Most likely the email-inbox SQL hasn't been run. A 500 makes Resend retry later.
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!logId) return NextResponse.json({ ok: true, duplicate: true });

  // Answer Resend straight away; the reading happens in the background.
  after(() => processInbound(db, logId, event));
  return NextResponse.json({ ok: true });
}
