import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

const PUBLIC_PATHS = ["/home", "/login", "/auth", "/samples", "/legal", "/pricing", "/solutions"];
// Reachable before the two-step code has been entered.
const MFA_FREE_PATHS = ["/login", "/auth/signout", "/auth/callback", "/auth/confirm", "/legal", "/home", "/pricing", "/solutions", "/samples", "/api/errors", "/api/stripe/webhook", "/api/inbound/resend", "/api/imports/worker", "/api/cron"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Refreshes the auth token. Keep this call directly after creating the client.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const path = request.nextUrl.pathname;

  // Two-step sign-in: someone who turned it on but hasn't entered their code yet only reaches the code page.
  if (signedIn && data?.claims?.aal !== "aal2" && !MFA_FREE_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Enter your two-step sign-in code first." }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login/mfa";
      url.search = `?next=${encodeURIComponent(path === "/" ? "/" : path + request.nextUrl.search)}`;
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }
  // Signed-out visitors to / see the marketing landing page; the URL stays /.
  if (!signedIn && path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    const rewrite = NextResponse.rewrite(url, { request });
    response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
    return rewrite;
  }
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  if (!signedIn && !isPublic && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}
