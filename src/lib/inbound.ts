// Workspace inbox addresses: <workspace-name>.<token>@<INBOUND_EMAIL_DOMAIN>.
// Only the 10-character token picks the workspace; the name part is there so people recognise it.
// Pure functions, safe to import anywhere.

export const TOKEN_RE = /^[a-z2-9]{10}$/;

export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return s || "contracts";
}

export function inboxAddress(domain: string, workspaceName: string, token: string): string {
  return `${slugify(workspaceName)}.${token}@${domain}`;
}

/** Lowercased bare address from "Name <a@b.com>" or "a@b.com", or null. */
export function parseAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^<>\s]+@[^<>\s]+)>/) ?? raw.match(/([^\s<>"',;]+@[^\s<>"',;]+)/);
  return m ? m[1].toLowerCase() : null;
}

/** The workspace token in an address at our inbound domain, or null. Accepts "token@", "name.token@" and "x+token@". */
export function tokenFromAddress(raw: string, domain: string): string | null {
  const addr = parseAddress(raw);
  if (!addr) return null;
  const at = addr.lastIndexOf("@");
  if (addr.slice(at + 1) !== domain.toLowerCase()) return null;
  const local = addr.slice(0, at);
  const token = local.split(/[.+]/).pop() ?? "";
  return TOKEN_RE.test(token) ? token : null;
}

export type AttachmentKind = "pdf" | "docx";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MIME: Record<AttachmentKind, string> = { pdf: "application/pdf", docx: DOCX_TYPE };

/** Which attachments we read. Old .doc files and images are skipped. */
export function attachmentKind(filename: string | null | undefined, contentType: string | null | undefined): AttachmentKind | null {
  const name = (filename ?? "").toLowerCase();
  const type = (contentType ?? "").toLowerCase().split(";")[0].trim();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type === DOCX_TYPE || name.endsWith(".docx")) return "docx";
  return null;
}

export type AuthVerdict = "pass" | "fail" | "gray" | "processing_failed" | "unknown";
export interface MailAuth {
  spf?: AuthVerdict | null;
  dkim?: AuthVerdict | null;
  dmarc?: AuthVerdict | null;
}

/**
 * Is the From address believable? Anyone can type a colleague's address into From, so we only trust it
 * when the receiving server says the sender's domain authorised the message: DMARC passed, or the domain
 * publishes no DMARC policy ("gray") and DKIM passed. Resend only reports DKIM "pass" when the signing
 * domain matches From; SPF alone isn't enough, because it checks the envelope sender, not From.
 */
export function senderVerified(auth: MailAuth | null | undefined): boolean {
  if (!auth) return false;
  if (auth.dmarc === "pass") return true;
  if (auth.dmarc === "gray") return auth.dkim === "pass";
  return false;
}
