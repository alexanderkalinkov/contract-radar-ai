import "server-only";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getSession, type SessionInfo } from "./workspace";

type Ok = { session: SessionInfo; supabase: Awaited<ReturnType<typeof createClient>> };

/** For API routes that only make sense with Supabase and a signed-in user. */
export async function requireSession(): Promise<Ok | NextResponse> {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Supabase is not configured: the app is in demo mode." }, { status: 400 });
  }
  const session = await getSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return { session, supabase: await createClient() };
}
