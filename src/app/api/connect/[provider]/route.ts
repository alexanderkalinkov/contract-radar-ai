import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { providerName } from "@/lib/discovery/types";
import { requireSession } from "@/lib/server/api";
import { encryptionBlocker, isConfigured, isProvider, PROVIDER_CONFIG, redirectUri } from "@/lib/server/connectors/config";
import { authorizeUrl, revoke, safeReturn, STATE_COOKIE } from "@/lib/server/connectors/oauth";
import { loadTokens, missingTables, syncProvider } from "@/lib/server/connectors/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ provider: string }> };

const back = (req: NextRequest, path: string, q: Record<string, string>) => {
  const u = new URL(path, req.nextUrl.origin);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
};

/** GET /api/connect/:provider?return=/setup → the provider's sign-in page. Admins only. */
export async function GET(req: NextRequest, { params }: Params) {
  const { provider } = await params;
  const ret = safeReturn(req.nextUrl.searchParams.get("return"));
  if (!isProvider(provider)) return back(req, ret, { connect_error: "Unknown source." });
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) {
    if (ctx.status === 401) return back(req, "/login", { next: ret });
    return back(req, ret, { connect_error: "Connecting sources needs Supabase login (the app is in demo mode)." });
  }
  if (ctx.session.role !== "owner") return back(req, ret, { connect_error: "Only admins can connect accounting and sign-in sources." });
  if (ctx.session.workspace.is_demo) return back(req, ret, { connect_error: "This is the demo workspace: its sources are simulated, so there's nothing to sign in to." });
  const blocker = encryptionBlocker();
  if (blocker) return back(req, ret, { connect_error: blocker });
  if (!isConfigured(provider)) {
    const [a, b] = PROVIDER_CONFIG[provider].envNames;
    return back(req, ret, { connect_error: `${providerName(provider)} isn't set up on this server yet: add ${a} and ${b}. See docs/auto-discovery-setup.md.` });
  }

  const nonce = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(provider, redirectUri(provider, req.nextUrl.origin), `${provider}.${nonce}`));
  res.cookies.set(STATE_COOKIE, JSON.stringify({ provider, nonce, ret, ws: ctx.session.workspace.id }), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/connect",
    maxAge: 600,
  });
  return res;
}

/** POST /api/connect/:provider → sync now. */
export async function POST(_req: NextRequest, { params }: Params) {
  const { provider } = await params;
  if (!isProvider(provider)) return NextResponse.json({ ok: false, error: "Unknown source." }, { status: 404 });
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.session.role !== "owner") return NextResponse.json({ ok: false, error: "Only admins can sync sources." }, { status: 403 });
  if (ctx.session.workspace.is_demo) {
    // Demo sources have no real sign-in behind them: "sync" just reports what the demo already holds.
    const { count } = await ctx.supabase
      .from("discovery_signals")
      .select("vendor_key", { count: "exact", head: true })
      .eq("workspace_id", ctx.session.workspace.id)
      .eq("provider", provider);
    return NextResponse.json({ ok: true, summary: { tools: count ?? 0 } });
  }
  try {
    const r = await syncProvider(ctx.supabase, ctx.session.workspace.id, provider);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: missingTables((e as Error).message) }, { status: 500 });
  }
}

/** DELETE /api/connect/:provider → revoke, and delete the tokens and everything this source found. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { provider } = await params;
  if (!isProvider(provider)) return NextResponse.json({ ok: false, error: "Unknown source." }, { status: 404 });
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.session.role !== "owner") return NextResponse.json({ ok: false, error: "Only admins can disconnect sources." }, { status: 403 });
  const { supabase, session } = ctx;
  const ws = session.workspace.id;
  try {
    const loaded = await loadTokens(supabase, ws, provider).catch(() => null);
    if (loaded?.tokens) await revoke(provider, loaded.tokens);
    await supabase.from("discovery_signals").delete().eq("workspace_id", ws).eq("provider", provider);
    const { error } = await supabase.from("connections").delete().eq("workspace_id", ws).eq("provider", provider);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: missingTables((e as Error).message) }, { status: 500 });
  }
}
