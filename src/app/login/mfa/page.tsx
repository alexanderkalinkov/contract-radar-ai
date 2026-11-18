import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { AuthShell } from "../AuthShell";
import { MfaForm } from "./MfaForm";

export const dynamic = "force-dynamic";

/** Second sign-in step for people who turned on two-step sign-in (Account page). */
export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!isSupabaseConfigured) redirect("/");
  const { next: nextParam } = await searchParams;
  const next = safeNextPath(nextParam, "/");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") redirect(next);
  return (
    <AuthShell title="Enter your code" subtitle={`Open your authenticator app and enter the 6-digit code for ${String(claims.claims.email ?? "your account")}.`}>
      <MfaForm next={next} />
      <div className="flex flex-col gap-2 text-center text-[13px] text-muted">
        <span>
          Lost your phone? <Link href="/help?topic=account#support" className="font-semibold text-ink underline">Contact support</Link> and we&apos;ll
          check it&apos;s you before turning two-step sign-in off.
        </span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="font-semibold text-ink underline">Sign out</button>
        </form>
      </div>
    </AuthShell>
  );
}
