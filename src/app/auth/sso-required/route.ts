import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** A password or email-link session for a company that requires SSO: sign it out and send them to SSO sign-in. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = String(data?.claims?.email ?? "");
  await supabase.auth.signOut();
  const url = new URL("/login/sso", request.url);
  url.searchParams.set("required", "1");
  if (email) url.searchParams.set("email", email);
  return NextResponse.redirect(url);
}
