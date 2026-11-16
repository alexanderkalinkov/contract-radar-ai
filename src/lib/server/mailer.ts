import "server-only";
import { brand } from "@/lib/email/brand";
import type { RenderedEmail } from "@/lib/email/templates";

// Sends through Resend's HTTP API (the same Resend account that Supabase Auth uses as custom SMTP).
// RESEND_API_KEY = a Resend API key with "Sending access". EMAIL_FROM must be on a domain verified in Resend.

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY);

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendEmail(to: string | string[], email: RenderedEmail, opts: { tags?: Record<string, string>; replyTo?: string; attachments?: { filename: string; content: string }[] } = {}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set, so the app can't send email yet." };
  const b = brand();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: b.from,
        to: Array.isArray(to) ? to : [to],
        reply_to: opts.replyTo || b.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
        tags: Object.entries(opts.tags ?? {}).map(([name, value]) => ({ name, value: value.replace(/[^A-Za-z0-9_-]/g, "_") })),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: json.message ?? `Resend answered ${res.status}` };
    return { ok: true, id: json.id ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
