import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { guessCategory } from "@/lib/team/types";
import { brand } from "@/lib/email/brand";
import { inboundReceiptEmail, type InboundAdded, type InboundSkipped } from "@/lib/email/templates";
import { attachmentKind, inboxAddress, MIME, parseAddress, senderVerified, tokenFromAddress, type AttachmentKind, type MailAuth } from "@/lib/inbound";
import { extractionColumns } from "@/lib/saved";
import { CONTRACTS_BUCKET } from "@/lib/supabase/config";
import { adminClient } from "./admin";
import { limitReasonAdmin } from "./billing";
import { docxToText, extractContract, isExtractError, isPdf, isZip, MAX_CONTRACT_BYTES } from "./extract";
import { sendEmail } from "./mailer";

// Contracts emailed to a workspace inbox. Resend receives the mail and calls /api/inbound/resend with
// the email.received event (metadata only); we then fetch the details and attachments from Resend's API.
// Setup: docs/email-inbox-setup.md.
//
//   INBOUND_EMAIL_DOMAIN       the receiving domain, e.g. "abc123.resend.app" now, "in.yourdomain.com" later
//   RESEND_WEBHOOK_SECRET      signing secret of the email.received webhook (whsec_...)
//   RESEND_INBOUND_API_KEY     optional: a Resend key with full access (reading received mail). Defaults to RESEND_API_KEY.

const MAX_ATTACHMENTS = 10;

export function inboundDomain(): string | null {
  const d = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase().replace(/^@/, "");
  return d || null;
}

export const isInboundConfigured = () => Boolean(inboundDomain() && process.env.RESEND_WEBHOOK_SECRET?.trim());

export function workspaceInbox(name: string, token: string | null | undefined): string | null {
  const domain = inboundDomain();
  return domain && token ? inboxAddress(domain, name, token) : null;
}

// ---------------------------------------------------------------------------
// Webhook signature (Resend signs webhooks the Svix way)
// ---------------------------------------------------------------------------

const TOLERANCE_SECONDS = 5 * 60;

/** Checks svix-id / svix-timestamp / svix-signature against the raw body. Returns an error message or null. */
export function verifyWebhook(body: string, headers: Headers, secret: string, now = Date.now()): string | null {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigs = headers.get("svix-signature");
  if (!id || !ts || !sigs) return "Missing signature headers.";
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > TOLERANCE_SECONDS) return "Timestamp too old or invalid.";
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  for (const part of sigs.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return null;
  }
  return "Signature does not match.";
}

// ---------------------------------------------------------------------------
// Resend receiving API
// ---------------------------------------------------------------------------

export interface ReceivedEvent {
  type: string;
  data: {
    email_id: string;
    from?: string;
    to?: string[];
    cc?: string[];
    received_for?: string[];
    subject?: string;
  };
}

interface ReceivedEmail {
  id: string;
  from: string;
  to?: string[];
  cc?: string[];
  received_for?: string[];
  subject?: string | null;
  authentication?: MailAuth | null;
}

interface ReceivedAttachment {
  id: string;
  filename: string | null;
  content_type: string | null;
  content_disposition: string | null;
  size: number | null;
  download_url: string;
}

async function resend<T>(path: string): Promise<T> {
  const key = process.env.RESEND_INBOUND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not set.");
  const res = await fetch(`https://api.resend.com${path}`, { headers: { authorization: `Bearer ${key}` }, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? `Resend refused the API key (${res.status}). Reading received mail needs a key with full access: set RESEND_INBOUND_API_KEY.`
        : `Resend answered ${res.status}: ${json.message ?? "no message"}`,
    );
  }
  return json;
}

/** The first workspace token found in any recipient field. */
export function tokenFromRecipients(lists: (string[] | undefined)[], domain: string): string | null {
  for (const list of lists) for (const a of list ?? []) {
    const t = tokenFromAddress(a, domain);
    if (t) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

type Db = NonNullable<ReturnType<typeof adminClient>>;
type Status = "done" | "partial" | "rejected" | "failed";

async function finish(db: Db, logId: string, status: Status, detail: string, extra: Record<string, unknown> = {}) {
  await db.from("inbound_emails").update({ status, detail: detail.slice(0, 1000), ...extra }).eq("id", logId);
}

/**
 * Records the email so a webhook retry is ignored. Returns the log row id, or null when this email was
 * already handled.
 */
export async function claimInbound(db: Db, event: ReceivedEvent): Promise<string | null> {
  const { data, error } = await db
    .from("inbound_emails")
    .upsert(
      { provider_email_id: event.data.email_id, from_email: parseAddress(event.data.from), subject: event.data.subject?.slice(0, 300) ?? null },
      { onConflict: "provider_email_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  return data?.[0]?.id ?? null;
}

export async function processInbound(db: Db, logId: string, event: ReceivedEvent): Promise<void> {
  try {
    await run(db, logId, event);
  } catch (e) {
    console.error("inbound email failed", e);
    await finish(db, logId, "failed", (e as Error).message);
  }
}

async function run(db: Db, logId: string, event: ReceivedEvent) {
  const domain = inboundDomain();
  if (!domain) return finish(db, logId, "failed", "INBOUND_EMAIL_DOMAIN is not set.");
  const d = event.data;

  // 1. Which workspace? The token in the address the mail was sent to.
  const token = tokenFromRecipients([d.to, d.received_for, d.cc], domain);
  if (!token) return finish(db, logId, "rejected", "Not addressed to a workspace inbox.");
  const { data: ws } = await db.from("workspaces").select("id, name, inbox_token").eq("inbox_token", token).maybeSingle();
  if (!ws) return finish(db, logId, "rejected", "No workspace uses this inbox address (it may have been replaced).");
  await db.from("inbound_emails").update({ workspace_id: ws.id }).eq("id", logId);
  const address = inboxAddress(domain, ws.name, ws.inbox_token);

  // 2. Who sent it? Must be a member, and the From address must be authenticated by their mail server.
  const email = await resend<ReceivedEmail>(`/emails/receiving/${encodeURIComponent(d.email_id)}`);
  const sender = parseAddress(email.from);
  if (!sender) return finish(db, logId, "rejected", "No sender address.");
  const { data: member } = await db
    .from("workspace_members")
    .select("user_id, email, department_id")
    .eq("workspace_id", ws.id)
    .ilike("email", sender.replace(/([\\%_])/g, "\\$1"))
    .maybeSingle();
  // Never answer people outside the workspace: their address may be forged, and replies would be spam.
  if (!member) return finish(db, logId, "rejected", `${sender} is not a member of this workspace.`, { from_email: sender });

  const b = brand();
  const reply = (r: Parameters<typeof inboundReceiptEmail>[1]) =>
    sendEmail(sender, inboundReceiptEmail(b, r), { tags: { type: "inbound_receipt" } });
  const base = { workspace: ws.name, address, subject: email.subject ?? d.subject ?? null };

  const trustAll = process.env.INBOUND_TRUST_UNVERIFIED_SENDERS === "true";
  if (!trustAll && !senderVerified(email.authentication)) {
    const a = email.authentication;
    const why = a ? `SPF ${a.spf ?? "?"}, DKIM ${a.dkim ?? "?"}, DMARC ${a.dmarc ?? "?"}` : "no authentication results";
    // The reply goes to the member's real address, so a forged email only tells the real person about it.
    await reply({ ...base, added: [], skipped: [], problem: "unverified" });
    return finish(db, logId, "rejected", `Could not verify the sender (${why}).`, { from_email: sender });
  }

  // 3. The attachments we can read.
  const list = await resend<{ data: ReceivedAttachment[] }>(`/emails/receiving/${encodeURIComponent(d.email_id)}/attachments`);
  const skipped: InboundSkipped[] = [];
  const usable: (ReceivedAttachment & { kind: AttachmentKind })[] = [];
  for (const a of list.data ?? []) {
    const kind = attachmentKind(a.filename, a.content_type);
    const name = a.filename || "attachment";
    if (!kind) {
      // Logos and signature images are inline; only mention real attachments we ignored.
      if (a.content_disposition !== "inline" && !(a.content_type ?? "").startsWith("image/")) skipped.push({ file: name, reason: "Not a PDF or Word (.docx) file" });
      continue;
    }
    if (a.size != null && a.size > MAX_CONTRACT_BYTES) skipped.push({ file: name, reason: "Larger than 20 MB" });
    else if (usable.length >= MAX_ATTACHMENTS) skipped.push({ file: name, reason: `Only the first ${MAX_ATTACHMENTS} files in one email are read` });
    else usable.push({ ...a, kind });
  }
  if (!usable.length) {
    await reply({ ...base, added: [], skipped, problem: "no_files" });
    return finish(db, logId, "rejected", "No PDF or Word attachments.");
  }

  // 4. Read each one, save it like an upload, and file it as a suggested tool in the sender's department.
  const { count } = await db.from("contracts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("demo", false);
  let total = count ?? 0;
  const added: InboundAdded[] = [];
  const ids: string[] = [];
  for (const a of usable) {
    const name = (a.filename || `contract.${a.kind}`).slice(0, 200);
    const limit = await limitReasonAdmin(ws.id, "contracts", total);
    if (limit) {
      skipped.push({ file: name, reason: limit });
      continue;
    }
    const res = await fetch(a.download_url, { cache: "no-store" });
    if (!res.ok) {
      skipped.push({ file: name, reason: "Could not download it from the mail server" });
      continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_CONTRACT_BYTES) {
      skipped.push({ file: name, reason: "Larger than 20 MB" });
      continue;
    }
    let result;
    if (a.kind === "pdf") {
      if (!isPdf(bytes)) {
        skipped.push({ file: name, reason: "The file isn't a real PDF" });
        continue;
      }
      result = await extractContract(name, { kind: "pdf", bytes });
    } else {
      const text = isZip(bytes) ? await docxToText(bytes) : null;
      if (!text) {
        skipped.push({ file: name, reason: "Couldn't read text from this Word file" });
        continue;
      }
      result = await extractContract(name, { kind: "text", text });
    }
    if (isExtractError(result)) {
      skipped.push({ file: name, reason: result.error });
      continue;
    }

    const id = crypto.randomUUID();
    const filePath = `${ws.id}/${id}.${a.kind}`;
    const up = await db.storage.from(CONTRACTS_BUCKET).upload(filePath, bytes, { contentType: MIME[a.kind], upsert: false });
    const { error } = await db.from("contracts").insert({
      id,
      workspace_id: ws.id,
      uploaded_by: member.user_id,
      uploaded_by_email: member.email,
      file_name: name,
      file_path: up.error ? null : filePath,
      extraction: result.data,
      model: result.model ?? null,
      demo: result.demo,
      source: "email",
      ...extractionColumns(result.data, result.noticeDeadline),
    });
    if (error) {
      if (!up.error) await db.storage.from(CONTRACTS_BUCKET).remove([filePath]);
      skipped.push({ file: name, reason: `Read it, but couldn't save it (${error.message})` });
      continue;
    }
    await db.from("tools").upsert(
      {
        workspace_id: ws.id,
        contract_id: id,
        department_id: member.department_id ?? null,
        name: result.data.vendor.slice(0, 120),
        category: guessCategory(`${result.data.vendor} ${result.data.agreement_name ?? ""}`),
        annual_cost: result.data.annual_fee.value,
        seats: result.data.seats.value,
        renewal_date: extractionColumns(result.data, null).term_end,
        source: "upload",
        confirmed: false,
        created_by: member.user_id,
      },
      { onConflict: "contract_id", ignoreDuplicates: true },
    );
    total += 1;
    ids.push(id);
    added.push({
      vendor: result.data.vendor,
      agreement: result.data.agreement_name,
      file: name,
      noticeDeadline: result.noticeDeadline,
      termEnd: extractionColumns(result.data, null).term_end,
      annualFee: result.data.annual_fee.value,
      currency: result.data.currency,
      url: `${b.appUrl}/contracts/${id}`,
      demo: result.demo,
    });
  }

  await reply({ ...base, added, skipped, problem: added.length ? null : "none_read" });
  const status: Status = added.length === 0 ? "failed" : skipped.length ? "partial" : "done";
  const detail = [
    added.length ? `Added: ${added.map((x) => x.vendor).join("; ")}.`.replace(/\.\.$/, ".") : "",
    skipped.length ? `Skipped ${skipped.map((s) => `${s.file} (${s.reason})`).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  await finish(db, logId, status, detail || "Nothing to add.", { contract_ids: ids });
}
