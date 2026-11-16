import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";
import { SUPABASE_URL } from "@/lib/supabase/config";
import type { SsoConfig, SsoData } from "@/lib/enterprise/types";

const MIGRATION = "Run supabase/migrations/20261116230000_audit_entities_sso.sql in the Supabase SQL editor to turn on single sign-on settings.";
const missing = (msg: string) => (/relation .* does not exist|Could not find the table|schema cache/i.test(msg) ? MIGRATION : msg);
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
// Personal email domains can never be claimed for SSO.
const PUBLIC_DOMAINS = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "abv.bg"]);

function serviceProvider(): SsoData["serviceProvider"] {
  if (!SUPABASE_URL) return null;
  const base = SUPABASE_URL.replace(/\/$/, "");
  return { entityId: `${base}/auth/v1/sso/saml/metadata`, acsUrl: `${base}/auth/v1/sso/saml/acs`, metadataUrl: `${base}/auth/v1/sso/saml/metadata?download=true` };
}

async function adminCtx() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.session.role !== "owner") return NextResponse.json({ ok: false, error: "Only admins can manage single sign-on." }, { status: 403 });
  return ctx;
}

export async function GET() {
  const ctx = await adminCtx();
  if (ctx instanceof NextResponse) return ctx;
  const { data, error } = await ctx.supabase
    .from("workspace_sso")
    .select("id, domain, metadata_url, status, enforce, default_role, created_at, activated_at")
    .eq("workspace_id", ctx.session.workspace.id)
    .order("created_at");
  if (error) return NextResponse.json({ error: missing(error.message) }, { status: 500 });
  const body: SsoData = { configs: (data ?? []) as SsoConfig[], serviceProvider: serviceProvider(), enabled: process.env.SSO_ENABLED === "true" };
  return NextResponse.json(body);
}

type Body =
  | { op: "request"; domain: string; metadata_url: string; default_role?: string }
  | { op: "update"; id: string; metadata_url?: string; enforce?: boolean; default_role?: string }
  | { op: "remove"; id: string };

export async function POST(req: Request) {
  const ctx = await adminCtx();
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => null)) as Body | null;
  const ws = ctx.session.workspace.id;
  const done = (error: { message: string } | null) =>
    NextResponse.json(error ? { ok: false, error: missing(error.message) } : { ok: true }, { status: error ? 400 : 200 });
  const role = (v: unknown) => (v === "approver" || v === "viewer" ? v : "member");
  const url = (v: unknown) => {
    const s = String(v ?? "").trim();
    return /^https:\/\/[^\s]+$/.test(s) && s.length <= 500 ? s : null;
  };

  switch (body?.op) {
    case "request": {
      const domain = String(body.domain ?? "").trim().toLowerCase().replace(/^@/, "");
      if (!DOMAIN.test(domain)) return NextResponse.json({ ok: false, error: "Enter your company's email domain, like acme.com." }, { status: 400 });
      if (PUBLIC_DOMAINS.has(domain)) return NextResponse.json({ ok: false, error: `${domain} is a personal email domain, so it can't use SSO.` }, { status: 400 });
      if (!ctx.session.email.toLowerCase().endsWith(`@${domain}`)) {
        return NextResponse.json({ ok: false, error: `Request SSO from an admin account at ${domain}, so we know the domain is yours.` }, { status: 400 });
      }
      const metadata_url = url(body.metadata_url);
      if (!metadata_url) return NextResponse.json({ ok: false, error: "Paste the SAML metadata URL from your identity provider (it starts with https://)." }, { status: 400 });
      const { error } = await ctx.supabase.from("workspace_sso").insert({ workspace_id: ws, domain, metadata_url, default_role: role(body.default_role) });
      if (error && /duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ ok: false, error: `SSO for ${domain} is already set up in a workspace. Contact support if that's unexpected.` }, { status: 400 });
      }
      return done(error);
    }
    case "update": {
      const patch: Record<string, unknown> = {};
      if (body.metadata_url !== undefined) {
        const m = url(body.metadata_url);
        if (!m) return NextResponse.json({ ok: false, error: "The metadata URL must start with https://." }, { status: 400 });
        patch.metadata_url = m;
      }
      if (typeof body.enforce === "boolean") {
        // So an admin can't lock everyone out with a provider that doesn't work yet.
        if (body.enforce && !ctx.session.viaSso) {
          return NextResponse.json({ ok: false, error: "Sign in once with SSO first (sign out, then use “Sign in with SSO”), then turn this on. That proves it works before passwords stop." }, { status: 400 });
        }
        patch.enforce = body.enforce;
      }
      if (body.default_role !== undefined) patch.default_role = role(body.default_role);
      if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
      return done((await ctx.supabase.from("workspace_sso").update(patch).eq("id", body.id).eq("workspace_id", ws)).error);
    }
    case "remove":
      return done((await ctx.supabase.from("workspace_sso").delete().eq("id", body.id).eq("workspace_id", ws)).error);
    default:
      return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
}
