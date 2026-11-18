import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "../AuthShell";
import { ResetForm } from "./ResetForm";

// The reset email link goes through /auth/callback, which signs the user in
// with a recovery session and sends them here to choose a new password.
export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured) redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return (
      <AuthShell title="Link expired" subtitle="This password reset link is no longer valid.">
        <p className="m-0 text-sm text-ink-2">
          Reset links work once and expire after an hour. Open the link in the same browser you requested it from, or ask for a new one.
        </p>
        <Link href="/login/forgot" className="text-center text-sm font-semibold text-ink underline">
          Send a new reset link
        </Link>
      </AuthShell>
    );
  }
  // Supabase only lets a two-step (aal2) session change the password, and a reset link signs in at aal1.
  // So people with two-step sign-in enter their authenticator code first, then come back here.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect(`/login/mfa?next=${encodeURIComponent("/login/reset")}`);
  return (
    <AuthShell title="Choose a new password" subtitle={`For ${data.user.email}`}>
      <ResetForm />
    </AuthShell>
  );
}
