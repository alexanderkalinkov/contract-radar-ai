import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
      <LoginForm next={next && next.startsWith("/") ? next : "/"} initialMode={mode === "signup" ? "signup" : "signin"} />
    </AuthShell>
  );
}
