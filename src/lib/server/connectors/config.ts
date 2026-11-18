import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ProviderId } from "@/lib/discovery/types";

// OAuth apps are registered once by us (Outflow), not by each customer.
// Each provider needs a client ID and secret in .env.local / Vercel; see docs/auto-discovery-setup.md.

export interface ProviderConfig {
  id: ProviderId;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** How the token endpoint wants the client credentials. */
  auth: "basic" | "body";
  extraAuthParams?: Record<string, string>;
  envNames: [string, string];
}

const env = (k: string) => (process.env[k] ?? "").trim();

export const PROVIDER_CONFIG: Record<ProviderId, ProviderConfig> = {
  quickbooks: {
    id: "quickbooks",
    clientId: env("QUICKBOOKS_CLIENT_ID"),
    clientSecret: env("QUICKBOOKS_CLIENT_SECRET"),
    authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    // Intuit has no read-only accounting scope. We only ever read; see the integration plan §3.2.
    scopes: ["com.intuit.quickbooks.accounting"],
    auth: "basic",
    envNames: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"],
  },
  xero: {
    id: "xero",
    clientId: env("XERO_CLIENT_ID"),
    clientSecret: env("XERO_CLIENT_SECRET"),
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    // Granular read scopes (required for apps created after 2 March 2026).
    scopes: ["offline_access", "accounting.invoices.read", "accounting.banktransactions.read", "accounting.contacts.read"],
    auth: "basic",
    envNames: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],
  },
  google: {
    id: "google",
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // Admin metadata only: no Gmail or Drive content scopes, so no CASA assessment.
    scopes: [
      "https://www.googleapis.com/auth/admin.reports.audit.readonly",
      "https://www.googleapis.com/auth/admin.directory.user.readonly",
    ],
    auth: "body",
    extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    envNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  microsoft: {
    id: "microsoft",
    clientId: env("MICROSOFT_CLIENT_ID"),
    clientSecret: env("MICROSOFT_CLIENT_SECRET"),
    authorizeUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
    scopes: ["offline_access", "User.Read.All", "AuditLog.Read.All", "Directory.Read.All"],
    auth: "body",
    extraAuthParams: { response_mode: "query", prompt: "select_account" },
    envNames: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
  },
};

export const isConfigured = (p: ProviderId) => Boolean(PROVIDER_CONFIG[p].clientId && PROVIDER_CONFIG[p].clientSecret);

export const isProvider = (p: string): p is ProviderId => p in PROVIDER_CONFIG;

export const quickbooksApiBase = () =>
  env("QUICKBOOKS_ENVIRONMENT").toLowerCase() === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";

/** Where providers send the admin back. Must match the redirect URI registered with each provider exactly. */
export function redirectUri(provider: ProviderId, requestOrigin: string) {
  const base = env("APP_URL").replace(/\/$/, "") || requestOrigin;
  return `${base}/api/connect/${provider}/callback`;
}

// ---------------------------------------------------------------------------
// Token encryption (AES-256-GCM). Refresh tokens never leave the server unencrypted.
// ---------------------------------------------------------------------------

const KEY_ENV = "CONNECTOR_ENCRYPTION_KEY";

export function encryptionBlocker(): string | null {
  return env(KEY_ENV).length >= 16 ? null : `${KEY_ENV} is not set. Add a long random value to .env.local (and Vercel), then restart.`;
}

const key = () => createHash("sha256").update(env(KEY_ENV)).digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function decrypt(box: string): string {
  const [v, iv, tag, body] = box.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Unreadable token.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
}
