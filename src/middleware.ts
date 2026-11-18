import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { updateSession } from "@/lib/supabase/middleware";

// Called by other services, which sign their requests instead of sending a browser Origin.
const MACHINE_ENDPOINTS = ["/api/stripe/webhook", "/api/inbound/resend", "/api/imports/worker", "/api/cron/"];

/**
 * CSRF guard (on top of SameSite=Lax session cookies): a browser request that changes something must come
 * from this site. Browsers always send Origin on cross-site POST/PATCH/DELETE, so a mismatch means another
 * site is trying to act with the visitor's session.
 */
function crossSiteWrite(request: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const path = request.nextUrl.pathname;
  if (MACHINE_ENDPOINTS.some((p) => path.startsWith(p))) return false;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "cross-site";
  try {
    return new URL(origin).host !== (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host);
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  if (crossSiteWrite(request)) {
    return NextResponse.json({ error: "This request came from another website, so it was blocked." }, { status: 403 });
  }
  // Demo mode: no Supabase, no login.
  if (!isSupabaseConfigured) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|samples/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)"],
};
