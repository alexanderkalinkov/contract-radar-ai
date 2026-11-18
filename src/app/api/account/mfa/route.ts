import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";
import { allow, TOO_MANY } from "@/lib/server/rate-limit";

// Two-step sign-in with an authenticator app (Supabase Auth TOTP factors). Everything runs on the server so the
// upgraded session (aal2) lands in this browser's cookies.
//
//   GET                                   → { enabled, factors: [{ id, name, created_at }] }
//   POST { op: "enroll" }                 → { factorId, qr, secret }   (an SVG QR code for the app to scan)
//   POST { op: "verify", factorId, code } → turns it on
//   POST { op: "remove", factorId, code } → turns it off (needs a current code)

const CODE = /^\d{6}$/;

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { data, error } = await ctx.supabase.auth.mfa.listFactors();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const factors = (data?.totp ?? []).filter((f) => f.status === "verified").map((f) => ({ id: f.id, name: f.friendly_name ?? "Authenticator app", created_at: f.created_at }));
  return NextResponse.json({ ok: true, enabled: factors.length > 0, factors });
}

export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, session } = ctx;
  if (session.viaSso) {
    return NextResponse.json({ ok: false, error: "You sign in through your company's single sign-on, so two-step sign-in is managed there." }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { op?: string; factorId?: unknown; code?: unknown };
  const factorId = typeof body.factorId === "string" ? body.factorId : "";
  const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";

  if (body.op === "enroll") {
    if (!(await allow(`mfa-enroll:user:${session.userId}`, 10, 3600))) return NextResponse.json({ ok: false, error: TOO_MANY }, { status: 429 });
    // Drop any half-finished set-up from earlier, so names don't clash and stale secrets don't linger.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => null);
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator app ${new Date().toISOString().slice(0, 10)}` });
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Couldn't start set-up." }, { status: 400 });
    return NextResponse.json({ ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  if (body.op === "verify" || body.op === "remove") {
    if (!factorId) return NextResponse.json({ ok: false, error: "Missing authenticator." }, { status: 400 });
    if (!CODE.test(code)) return NextResponse.json({ ok: false, error: "Enter the 6-digit code from your authenticator app." }, { status: 400 });
    if (!(await allow(`mfa-code:user:${session.userId}`, 10, 900))) return NextResponse.json({ ok: false, error: TOO_MANY }, { status: 429 });
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) return NextResponse.json({ ok: false, error: "That code didn't work. Check the time on your phone is right and try the newest code." }, { status: 400 });
    if (body.op === "verify") return NextResponse.json({ ok: true, enabled: true });
    const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId });
    if (unErr) return NextResponse.json({ ok: false, error: unErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, enabled: false });
  }

  return NextResponse.json({ ok: false, error: "Unknown operation." }, { status: 400 });
}
