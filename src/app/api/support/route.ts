import { NextResponse } from "next/server";
import { allow } from "@/lib/server/rate-limit";
import { brand } from "@/lib/email/brand";
import { supportReceiptEmail, supportRequestEmail } from "@/lib/email/templates";
import { SUPPORT_ATTACHMENT_MAX, SUPPORT_ATTACHMENT_TYPES, topicLabel } from "@/lib/help";
import { getBilling } from "@/lib/server/billing";
import { supportEmail } from "@/lib/server/help";
import { sendEmail } from "@/lib/server/mailer";
import { adminClient } from "@/lib/server/admin";
import { getSession } from "@/lib/server/workspace";
import { roleLabel } from "@/lib/roles";

export const runtime = "nodejs";

// A light brake against someone (or a stuck script) flooding the inbox. Per server instance, which is enough here.

const clip = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** POST multipart form: topic, message, page, browser, errors (JSON list), optional attachment; email when signed out. */
export async function POST(request: Request) {
  const to = supportEmail();
  const db = adminClient();
  if (!to && !db) {
    return NextResponse.json({ ok: false, error: "Support email isn't set up yet. Please email us directly." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "That message couldn't be read. Try a smaller attachment." }, { status: 400 });
  }

  const session = await getSession().catch(() => null);
  const email = session?.email || clip(form.get("email"), 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Add your email so we can reply." }, { status: 400 });
  }
  const message = clip(form.get("message"), 5000);
  if (message.length < 5) return NextResponse.json({ ok: false, error: "Tell us a little more about what happened." }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await allow(`support:${session?.userId ?? `ip:${ip}`}`, 5, 600))) {
    return NextResponse.json({ ok: false, error: "You've sent a few messages in a row. Please wait a few minutes, or reply to our last email." }, { status: 429 });
  }

  const topic = topicLabel(clip(form.get("topic"), 40));
  const page = clip(form.get("page"), 300);
  let errors: string[] = [];
  try {
    const parsed = JSON.parse(clip(form.get("errors"), 4000) || "[]");
    if (Array.isArray(parsed)) errors = parsed.slice(-5).map((e) => String(e).slice(0, 400));
  } catch {
    /* ignore */
  }

  let attachments: { filename: string; content: string }[] | undefined;
  let attachmentLabel: string | null = null;
  let attachmentFile: { filename: string; type: string; bytes: Buffer } | null = null;
  const file = form.get("attachment");
  if (file instanceof File && file.size > 0) {
    if (file.size > SUPPORT_ATTACHMENT_MAX) return NextResponse.json({ ok: false, error: "That file is over 3 MB. Try a smaller screenshot." }, { status: 400 });
    if (!SUPPORT_ATTACHMENT_TYPES.includes(file.type)) return NextResponse.json({ ok: false, error: "Attach a PNG, JPG, GIF, WebP, PDF or text file." }, { status: 400 });
    const filename = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "attachment";
    const bytes = Buffer.from(await file.arrayBuffer());
    attachments = [{ filename, content: bytes.toString("base64") }];
    attachmentFile = { filename, type: file.type, bytes };
    attachmentLabel = `${filename} (${Math.round(file.size / 1024)} KB)`;
  }

  let plan: string | null = null;
  if (session) {
    const b = await getBilling(session.workspace.id).catch(() => null);
    if (b?.enabled) plan = [b.plan, b.state].filter(Boolean).join(" · ");
  }

  const b = brand(new URL(request.url).origin);
  const name = session?.name || null;
  const browser = clip(form.get("browser"), 400) || request.headers.get("user-agent");
  const mail = supportRequestEmail(b, {
    topic,
    message,
    from: { email, name, userId: session?.userId ?? null },
    workspace: session ? { id: session.workspace.id, name: session.workspace.name, role: roleLabel(session.role), isDemo: session.workspace.is_demo } : null,
    plan,
    page: page || null,
    browser,
    errors,
    attachment: attachmentLabel,
    sentAt: new Date().toISOString(),
  });

  // Kept for the platform admin console's Support inbox. Fails quietly before the SQL has run.
  let storedId: string | null = null;
  if (db) {
    const { data, error } = await db
      .from("support_requests")
      .insert({
        user_id: session?.userId ?? null,
        email,
        name,
        workspace_id: session?.workspace.id ?? null,
        workspace_name: session?.workspace.name ?? null,
        topic,
        message,
        page: page || null,
        attachment: attachmentLabel,
        role: session ? roleLabel(session.role) : null,
        plan,
        is_demo: session ? Boolean(session.workspace.is_demo) : null,
        browser,
        errors,
      })
      .select("id")
      .single();
    if (error) console.error("support request not stored", error.message);
    storedId = (data?.id as string | undefined) ?? null;
    // Keep the attachment too (private bucket), so the admin console can open it.
    if (storedId && attachmentFile) {
      const path = `${storedId}/${attachmentFile.filename}`;
      const up = await db.storage.from("support").upload(path, attachmentFile.bytes, { contentType: attachmentFile.type, upsert: true });
      if (!up.error) await db.from("support_requests").update({ attachment_path: path }).eq("id", storedId);
    }
  }
  const stored = Boolean(storedId);

  if (!to) {
    if (stored) return NextResponse.json({ ok: true, receipt: false });
    return NextResponse.json({ ok: false, error: "Support email isn't set up yet. Please email us directly." }, { status: 503 });
  }
  const sent = await sendEmail(to, mail, { replyTo: email, attachments, tags: { kind: "support" } });
  if (!sent.ok) {
    console.error("support email failed", sent.error);
    if (stored) return NextResponse.json({ ok: true, receipt: false });
    return NextResponse.json({ ok: false, error: `We couldn't send that just now. Please email ${to} directly.` }, { status: 502 });
  }
  if (storedId && db) await db.from("support_requests").update({ emailed: true }).eq("id", storedId);

  // A copy for them. Only to signed-in addresses, so the form can't be used to send mail to strangers.
  let receipt = false;
  if (session) {
    const r = await sendEmail(email, supportReceiptEmail(b, { topic, message, name }), { replyTo: to, tags: { kind: "support_receipt" } });
    receipt = r.ok;
  }
  return NextResponse.json({ ok: true, receipt });
}
