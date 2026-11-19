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

// Addresses the app used to live at. Once APP_URL points somewhere else, pages opened here move to APP_URL.
const OLD_HOSTS = (process.env.OLD_APP_HOSTS ?? "contract-radar-ai.vercel.app")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/**
 * Sends people (and old bookmarks, old email links) from the old address to the new one.
 * Only page views move: API calls, webhooks (Stripe, Resend) and sign-in links (/auth/*, whose
 * one-time cookie lives on the old address) keep working where they are until they are re-pointed.
 */
function moveToAppUrl(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/") || path.startsWith("/auth/")) return null;
  let target: URL;
  try {
    target = new URL(process.env.APP_URL?.trim() ?? "");
  } catch {
    return null;
  }
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host).toLowerCase();
  if (host === target.host.toLowerCase() || !OLD_HOSTS.includes(host)) return null;
  return NextResponse.redirect(new URL(path + request.nextUrl.search, target.origin), 308);
}

export async function middleware(request: NextRequest) {
  const moved = moveToAppUrl(request);
  if (moved) return moved;
  if (crossSiteWrite(request)) {
    return NextResponse.json({ error: "This request came from another website, so it was blocked." }, { status: 403 });
  }
  // Demo mode: no Supabase, no login.
  if (!isSupabaseConfigured) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  // Static files and the crawler files (robots.txt, sitemap.xml, llms.txt, manifest) skip the session check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|samples/|brand/|robots.txt|sitemap.xml|llms.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)"],
};
