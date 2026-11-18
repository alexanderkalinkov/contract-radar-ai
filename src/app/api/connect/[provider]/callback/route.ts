import { NextResponse, type NextRequest } from "next/server";
import { providerName } from "@/lib/discovery/types";
import { requireSession } from "@/lib/server/api";
import { isProvider, redirectUri } from "@/lib/server/connectors/config";
import { exchangeCode, safeReturn, STATE_COOKIE } from "@/lib/server/connectors/oauth";
import { saveConnection, syncProvider } from "@/lib/server/connectors/sync";

export const runtime = "nodejs";
// The first sync runs straight away so the admin lands on a filled-in list.
export const maxDuration = 60;

/** The provider sends the admin back here with ?code&state (QuickBooks adds &realmId). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const q = req.nextUrl.searchParams;
  let saved: { provider?: string; nonce?: string; ret?: string; ws?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(STATE_COOKIE)?.value ?? "{}");
  } catch {
    // ignore
  }
  const ret = safeReturn(saved.ret);
  const done = (query: Record<string, string>) => {
    const u = new URL(ret, req.nextUrl.origin);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    const res = NextResponse.redirect(u);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/connect", maxAge: 0 });
    return res;
  };

  if (!isProvider(provider)) return done({ connect_error: "Unknown source." });
  const name = providerName(provider);
  if (q.get("error")) return done({ connect_error: `${name} sign-in was cancelled (${q.get("error_description") ?? q.get("error")}).` });
  if (!saved.nonce || q.get("state") !== `${provider}.${saved.nonce}` || saved.provider !== provider) {
    return done({ connect_error: `The ${name} sign-in link expired or came from another browser. Click Connect again.` });
  }
  const code = q.get("code");
  if (!code) return done({ connect_error: `${name} didn't return a sign-in code. Click Connect again.` });

  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return done({ connect_error: "Your Outflow session ended. Sign in and connect again." });
  if (ctx.session.role !== "owner" || ctx.session.workspace.id !== saved.ws) return done({ connect_error: "Only the admin who started this can finish connecting." });

  try {
    const tokens = await exchangeCode(provider, code, redirectUri(provider, req.nextUrl.origin));
    const externalId = provider === "quickbooks" ? q.get("realmId") : null;
    await saveConnection(ctx.supabase, ctx.session.workspace.id, provider, tokens, externalId);
    const sync = await syncProvider(ctx.supabase, ctx.session.workspace.id, provider);
    if (!sync.ok) return done({ connected: provider, connect_error: `Connected to ${name}, but the first sync failed: ${sync.error}` });
    return done({ connected: provider, found: String(sync.summary?.tools ?? 0) });
  } catch (e) {
    return done({ connect_error: (e as Error).message });
  }
}
