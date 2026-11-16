import "server-only";
import { SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Where the onboarding video lives. It's 22 MB, so it stays out of git.
 * HELP_VIDEO_URL wins; otherwise the public "help" bucket in Supabase Storage.
 */
export function helpVideoUrl(): string | null {
  const explicit = process.env.HELP_VIDEO_URL?.trim();
  if (explicit) return explicit;
  if (SUPABASE_URL) return `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/help/contract-radar-onboarding.mp4`;
  return null;
}

/** The inbox that "Contact support" messages go to. */
export function supportEmail(): string | null {
  const v = process.env.SUPPORT_EMAIL?.trim() || process.env.LEGAL_EMAIL?.trim() || process.env.EMAIL_REPLY_TO?.trim();
  if (!v) return null;
  // EMAIL_REPLY_TO may be "Name <a@b.com>".
  const m = v.match(/<([^>]+)>/);
  return (m ? m[1] : v).trim() || null;
}
