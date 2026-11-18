import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supportEmail } from "@/lib/server/help";
import { AuthShell, FormAlert } from "./AuthShell";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; message?: string; mode?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/");
  const { next, error, message, mode } = await searchParams;
  return (
    <AuthShell title="Welcome" subtitle="Sign in to your team's contract workspace.">
      <FormAlert error={error} message={message} />
      <LoginForm next={safeNextPath(next, "/")} initialMode={mode === "signup" ? "signup" : "signin"} ssoEnabled={process.env.SSO_ENABLED === "true"} />
      {supportEmail() && (
        <p className="m-0 text-center text-xs text-muted">
          Trouble signing in? Email <a href={`mailto:${supportEmail()}?subject=${encodeURIComponent("Trouble signing in")}`} className="font-semibold text-brand underline">{supportEmail()}</a>
        </p>
      )}
    </AuthShell>
  );
}
