import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";
import { passwordProblem } from "@/lib/server/password";
import { allow, TOO_MANY } from "@/lib/server/rate-limit";

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
  if (password === current) return NextResponse.json({ ok: false, error: "Pick a password that's different from your current one." }, { status: 400 });
  const weak = await passwordProblem(password, session.email);
  if (weak) return NextResponse.json({ ok: false, error: weak }, { status: 400 });
  // Checking the current password is a sign-in attempt: limit it, or a stolen session could guess it.
  if (!(await allow(`pwchange:user:${session.userId}`, 5, 900))) return NextResponse.json({ ok: false, error: TOO_MANY }, { status: 429 });

  const check = await supabase.auth.signInWithPassword({ email: session.email, password: current });
  if (check.error) {
    return NextResponse.json({ ok: false, error: "Your current password isn't right. Forgot it? Sign out and use “Forgot password”." }, { status: 400 });
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  // Sign out every other device that still has the old password's session.
  await supabase.auth.signOut({ scope: "others" }).catch(() => null);
  return NextResponse.json({ ok: true });
}
