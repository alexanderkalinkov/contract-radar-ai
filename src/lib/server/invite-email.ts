import "server-only";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Emails an invite link. With SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) on the server it sends
 * Supabase's "You have been invited" email; without it, a sign-in link (magic link) that creates the
 * account. Either way the link lands on /auth/confirm, signs them in, and bootstrap_workspace() puts
 * them in the right workspace and department.
 */
export async function sendInviteEmail(email: string, origin: string): Promise<{ emailed: boolean; note?: string }> {
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent("/tools")}`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

  if (serviceKey) {
    const admin = createSupabase(SUPABASE_URL, serviceKey, opts);
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (!error) return { emailed: true };
    if (!/already|registered|exists/i.test(error.message)) return { emailed: false, note: friendly(error) };
    // Already has an account: fall through and send a sign-in link instead.
  }

  const anon = createSupabase(SUPABASE_URL, SUPABASE_KEY, { auth: { ...opts.auth, flowType: "implicit" } });
  const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectTo } });
  if (error) return { emailed: false, note: friendly(error) };
  return { emailed: true };
}

function friendly(error: { message: string; status?: number }) {
  if (error.status === 429 || /rate limit/i.test(error.message)) {
    return "Supabase's built-in email limit was hit (a few emails per hour on the free plan). Send them the invite link instead, or set up custom SMTP in Supabase.";
  }
  return `The invite was saved but the email didn't send: ${error.message}`;
}
