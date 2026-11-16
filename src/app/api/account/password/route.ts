import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";

/** POST { current, password }: change password. Checks the current one first, so an unlocked laptop isn't enough. */
export async function POST(request: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { session, supabase } = ctx;
  if (session.viaSso) {
    return NextResponse.json({ ok: false, error: "You sign in through your company's single sign-on, so your password is managed there." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { current?: unknown; password?: unknown };
  const current = typeof body.current === "string" ? body.current : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) return NextResponse.json({ ok: false, error: "Use at least 8 characters." }, { status: 400 });
  if (password === current) return NextResponse.json({ ok: false, error: "Pick a password that's different from your current one." }, { status: 400 });

  const check = await supabase.auth.signInWithPassword({ email: session.email, password: current });
  if (check.error) {
    return NextResponse.json({ ok: false, error: "Your current password isn't right. Forgot it? Sign out and use “Forgot password”." }, { status: 400 });
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
