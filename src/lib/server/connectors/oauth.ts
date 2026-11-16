import "server-only";
import type { ProviderId } from "@/lib/discovery/types";
import { PROVIDER_CONFIG } from "./config";

export const STATE_COOKIE = "cr_oauth";

/** Only same-site paths, so the callback can't be used as an open redirect. */
export const safeReturn = (p: string | null | undefined) =>
  p && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p.slice(0, 200) : "/discover";

export interface Tokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string; // ISO
}

export function authorizeUrl(provider: ProviderId, redirect: string, state: string) {
  const c = PROVIDER_CONFIG[provider];
  const u = new URL(c.authorizeUrl);
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("scope", c.scopes.join(" "));
  u.searchParams.set("state", state);
  for (const [k, v] of Object.entries(c.extraAuthParams ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

async function tokenRequest(provider: ProviderId, params: Record<string, string>): Promise<Tokens> {
  const c = PROVIDER_CONFIG[provider];
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (c.auth === "basic") headers.authorization = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`;
  else {
    body.set("client_id", c.clientId);
    body.set("client_secret", c.clientSecret);
  }
  if (provider === "microsoft") body.set("scope", c.scopes.join(" "));
  const res = await fetch(c.tokenUrl, { method: "POST", headers, body, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    const why = String(json.error_description ?? json.error ?? `HTTP ${res.status}`);
    throw new Error(`Sign-in with ${provider} failed: ${why}`);
  }
  const expiresIn = Number(json.expires_in ?? 3600);
  return {
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : (params.refresh_token ?? null),
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export const exchangeCode = (provider: ProviderId, code: string, redirect: string) =>
  tokenRequest(provider, { grant_type: "authorization_code", code, redirect_uri: redirect });

/** QuickBooks, Xero and Microsoft rotate refresh tokens: always store the one that comes back. */
export const refreshTokens = (provider: ProviderId, refresh_token: string) => tokenRequest(provider, { grant_type: "refresh_token", refresh_token });

/** Best effort: tell the provider we're done so the grant disappears from their admin console. */
export async function revoke(provider: ProviderId, tokens: { access_token: string; refresh_token: string | null }) {
  const c = PROVIDER_CONFIG[provider];
  const basic = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`;
  const token = tokens.refresh_token ?? tokens.access_token;
  try {
    if (provider === "google") {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
    } else if (provider === "quickbooks") {
      await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
        method: "POST",
        headers: { authorization: basic, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ token }),
      });
    } else if (provider === "xero") {
      await fetch("https://identity.xero.com/connect/revocation", {
        method: "POST",
        headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    }
    // Microsoft has no per-app revoke endpoint for delegated grants; the admin removes it under Enterprise applications.
  } catch {
    // Ignore: we delete our copy either way.
  }
}
