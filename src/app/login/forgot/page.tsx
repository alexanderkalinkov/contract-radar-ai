import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AuthShell } from "../AuthShell";
import { ForgotForm } from "./ForgotForm";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (!isSupabaseConfigured) redirect("/");
  const { email } = await searchParams;
  return (
    <AuthShell title="Reset your password" subtitle="Enter your work email and we'll send you a link to set a new password.">
      <ForgotForm defaultEmail={email ?? ""} />
    </AuthShell>
  );
}
