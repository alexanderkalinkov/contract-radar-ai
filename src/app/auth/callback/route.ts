import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logSignIn } from "@/lib/server/audit";
import { safeNextPath } from "@/lib/safe-redirect";

// Email confirmation and password reset links land here with a one-time code.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), "/");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await logSignIn(supabase, url.searchParams.get("method") === "sso" ? "sso" : "email_link");
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  if (next === "/login/reset") return NextResponse.redirect(new URL(next, url.origin));
  return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("That link has expired. Sign in again."), url.origin));
}
