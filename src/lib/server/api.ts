import "server-only";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/roles";
import { getSession, type SessionInfo } from "./workspace";

type Ok = { session: SessionInfo; supabase: Awaited<ReturnType<typeof createClient>> };

/** For API routes that only make sense with Supabase and a signed-in user. */
export async function requireSession(): Promise<Ok | NextResponse> {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Supabase is not configured: the app is in demo mode." }, { status: 400 });
  }
  const session = await getSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.ssoRequired) return NextResponse.json({ error: "Your company requires single sign-on. Sign in with SSO." }, { status: 401 });
  return { session, supabase: await createClient() };
}

/** Viewers are read only. Returns a 403 for them, or null for everyone else. RLS enforces the same rule. */
export function denyViewer(session: SessionInfo): NextResponse | null {
  return canWrite(session.role)
    ? null
    : NextResponse.json({ ok: false, error: "You have read-only access to this workspace. Ask an admin to change your role." }, { status: 403 });
}
