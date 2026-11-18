import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AuthShell, FormAlert } from "../AuthShell";
import { SsoForm } from "./SsoForm";

export default async function SsoLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; required?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/");
  const { email, next, required } = await searchParams;
  return (
    <AuthShell title="Sign in with SSO" subtitle="Use your company account (Okta, Microsoft Entra ID, Google Workspace or any SAML provider).">
      {required && <FormAlert error="Your company requires single sign-on for Outflow, so you've been signed out. Continue with SSO below." />}
      <SsoForm defaultEmail={email ?? ""} next={safeNextPath(next, "/")} />
      <Link href="/login" className="text-center text-[13px] font-semibold text-muted hover:text-ink">
        Back to email and password
      </Link>
    </AuthShell>
  );
}
