import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";

/**
 * PATCH { full_name?, job_title?, tour_seen? }: profile basics, kept in Supabase Auth user metadata
 * (no table needed). Refreshes the session so the new values are in the sign-in token straight away.
 */
export async function PATCH(request: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const body = (await request.json().catch(() => ({}))) as { full_name?: unknown; job_title?: unknown; tour_seen?: unknown };

  const data: Record<string, string> = {};
  if (typeof body.full_name === "string") data.full_name = body.full_name.trim().slice(0, 100);
  if (typeof body.job_title === "string") data.job_title = body.job_title.trim().slice(0, 100);
  if (body.tour_seen === true) data.tour_seen_at = new Date().toISOString();
  if (!Object.keys(data).length) return NextResponse.json({ ok: false, error: "Nothing to save." }, { status: 400 });

  const { error } = await ctx.supabase.auth.updateUser({ data });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  await ctx.supabase.auth.refreshSession().catch(() => undefined);
  return NextResponse.json({ ok: true });
}
