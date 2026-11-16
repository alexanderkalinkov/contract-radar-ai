import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST. Add ?scope=global to sign out on every device (revokes all sessions). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const scope = new URL(request.url).searchParams.get("scope") === "global" ? "global" : "local";
  await supabase.auth.signOut({ scope });
  const to = new URL("/login", request.url);
  if (scope === "global") to.searchParams.set("message", "You're signed out on every device.");
  return NextResponse.redirect(to, { status: 303 });
}
