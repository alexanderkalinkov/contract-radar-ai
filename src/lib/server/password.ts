import "server-only";
import { createHash } from "node:crypto";

/**
 * Password rules for every place a password is set (sign-up, reset, change, first password after an invite).
 * Supabase Auth stores passwords itself (bcrypt hashes in auth.users); the app never stores or logs them.
 * These checks follow NIST SP 800-63B: a minimum length, a maximum so hashing stays cheap, nothing built from
 * the email, and no password that has shown up in a data breach (Have I Been Pwned, k-anonymity: only the
 * first 5 characters of the SHA-1 hash leave the server). No forced symbols or rotation, which NIST advises against.
 */

export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt ignores anything after 72 bytes

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
  "11111111", "00000000", "abc12345", "iloveyou", "letmein1", "welcome1", "admin123", "contractradar",
]);

async function breached(password: string): Promise<boolean> {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const rest = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "contract-radar-password-check" },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [suffix, count] = line.trim().split(":");
      return suffix === rest && Number(count) > 0;
    });
  } catch {
    return false; // The check is a bonus: never block sign-up because the service is slow or down.
  }
}

/** An error to show, or null when the password is fine. */
export async function passwordProblem(password: string, email?: string): Promise<string | null> {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "That password is too easy to guess. Try a short phrase of a few words.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (email && (lower === email.toLowerCase() || (local && local.length >= 4 && lower.includes(local)))) {
    return "Don't use your email address in your password.";
  }
  if (await breached(password)) {
    return "That password has appeared in a data breach, so attackers try it first. Please pick a different one.";
  }
  return null;
}
