import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fileKind, type DriveProvider, type FileKind } from "@/lib/imports";
import { decrypt, encrypt, encryptionBlocker } from "../connectors/config";

// Google Drive and SharePoint / OneDrive folders for bulk import. These reuse the Google and Microsoft OAuth
// apps from auto-discovery (same client id and secret), with their own redirect URIs and file-read scopes:
//   https://<APP_URL>/api/drives/gdrive/callback      https://<APP_URL>/api/drives/onedrive/callback
// Setup: docs/bulk-import.md.

const env = (k: string) => (process.env[k] ?? "").trim();

interface DriveConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  extraAuthParams: Record<string, string>;
  envNames: [string, string];
}

export function driveConfig(p: DriveProvider): DriveConfig {
  return p === "gdrive"
    ? {
        clientId: env("GOOGLE_CLIENT_ID"),
        clientSecret: env("GOOGLE_CLIENT_SECRET"),
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        // drive.readonly is a "restricted" scope: fine for your own Google Workspace (internal app) or test users;
        // a public app needs Google's verification. See docs/bulk-import.md.
        scopes: ["openid", "email", "https://www.googleapis.com/auth/drive.readonly"],
        extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
        envNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      }
    : {
        clientId: env("MICROSOFT_CLIENT_ID"),
        clientSecret: env("MICROSOFT_CLIENT_SECRET"),
        authorizeUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
        tokenUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
        scopes: ["offline_access", "openid", "email", "User.Read", "Files.Read.All", "Sites.Read.All"],
        extraAuthParams: { response_mode: "query", prompt: "select_account" },
        envNames: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
      };
}

export const isDriveProvider = (p: string): p is DriveProvider => p === "gdrive" || p === "onedrive";

/** Why this drive can't be connected on this server yet, or null when it can. */
export function driveBlocker(p: DriveProvider): string | null {
  const c = driveConfig(p);
  if (!c.clientId || !c.clientSecret) return `Add ${c.envNames[0]} and ${c.envNames[1]} on the server first (see docs/bulk-import.md).`;
  return encryptionBlocker();
}

export function driveRedirectUri(p: DriveProvider, requestOrigin: string) {
  const base = env("APP_URL").replace(/\/$/, "") || requestOrigin;
  return `${base}/api/drives/${p}/callback`;
}

export function driveAuthorizeUrl(p: DriveProvider, redirect: string, state: string) {
  const c = driveConfig(p);
  const u = new URL(c.authorizeUrl);
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("scope", c.scopes.join(" "));
  u.searchParams.set("state", state);
  for (const [k, v] of Object.entries(c.extraAuthParams)) u.searchParams.set(k, v);
  return u.toString();
}

interface Tokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
}

async function tokenRequest(p: DriveProvider, params: Record<string, string>): Promise<Tokens> {
  const c = driveConfig(p);
  const body = new URLSearchParams({ ...params, client_id: c.clientId, client_secret: c.clientSecret });
  if (p === "onedrive") body.set("scope", c.scopes.join(" "));
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    throw new Error(`Sign-in failed: ${String(json.error_description ?? json.error ?? `HTTP ${res.status}`)}`);
  }
  return {
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : (params.refresh_token ?? null),
    expires_at: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000).toISOString(),
  };
}

export const exchangeDriveCode = (p: DriveProvider, code: string, redirect: string) =>
  tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirect });

async function accountEmail(p: DriveProvider, accessToken: string): Promise<string | null> {
  const url = p === "gdrive" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json()) as { email?: string; mail?: string; userPrincipalName?: string };
  return j.email ?? j.mail ?? j.userPrincipalName ?? null;
}

type Db = SupabaseClient;

export async function saveDriveConnection(db: Db, ws: string, userId: string, p: DriveProvider, t: Tokens) {
  const { error } = await db.from("drive_connections").upsert(
    {
      workspace_id: ws,
      user_id: userId,
      provider: p,
      account_email: await accountEmail(p, t.access_token),
      access_token: encrypt(t.access_token),
      refresh_token: t.refresh_token ? encrypt(t.refresh_token) : null,
      expires_at: t.expires_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,user_id,provider" },
  );
  if (error) throw new Error(missingImportTables(error.message));
}

export const missingImportTables = (msg: string) =>
  /relation .* does not exist|Could not find the (table|function)|schema cache/i.test(msg)
    ? "The bulk import tables aren't in the database yet. Run supabase/migrations/20261116223000_bulk_import.sql in the Supabase SQL editor."
    : msg;

export interface DriveConn {
  id: string;
  provider: DriveProvider;
  account_email: string | null;
}

export async function findDriveConnection(db: Db, ws: string, userId: string, p: DriveProvider): Promise<DriveConn | null> {
  const { data, error } = await db.from("drive_connections").select("id, provider, account_email").eq("workspace_id", ws).eq("user_id", userId).eq("provider", p).maybeSingle();
  if (error) throw new Error(missingImportTables(error.message));
  return (data as DriveConn | null) ?? null;
}

/** A valid access token for a saved connection, refreshing (and saving the rotated refresh token) when needed. */
export async function driveAccessToken(db: Db, connectionId: string): Promise<{ token: string; provider: DriveProvider }> {
  const { data: row, error } = await db.from("drive_connections").select("*").eq("id", connectionId).maybeSingle();
  if (error || !row) throw new Error("The drive sign-in for this import was removed. Connect the drive again and start a new import.");
  const provider = row.provider as DriveProvider;
  if (Date.parse(row.expires_at) > Date.now() + 120_000) return { token: decrypt(row.access_token), provider };
  if (!row.refresh_token) throw new Error("The drive sign-in expired. Connect the drive again.");
  const t = await tokenRequest(provider, { grant_type: "refresh_token", refresh_token: decrypt(row.refresh_token) });
  await db
    .from("drive_connections")
    .update({
      access_token: encrypt(t.access_token),
      refresh_token: t.refresh_token ? encrypt(t.refresh_token) : row.refresh_token,
      expires_at: t.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
  return { token: t.access_token, provider };
}

export async function revokeDrive(db: Db, conn: DriveConn) {
  try {
    if (conn.provider === "gdrive") {
      const { data } = await db.from("drive_connections").select("refresh_token, access_token").eq("id", conn.id).maybeSingle();
      const tok = data?.refresh_token ? decrypt(data.refresh_token) : data?.access_token ? decrypt(data.access_token) : null;
      if (tok) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tok)}`, { method: "POST" });
    }
  } catch {
    // Best effort: our copy is deleted either way.
  }
  await db.from("drive_connections").delete().eq("id", conn.id);
}

// ---------------------------------------------------------------------------
// Browsing and listing
// ---------------------------------------------------------------------------

/** A place the person can open in the folder picker. "id" is opaque and goes back into browse(). */
export interface DriveEntry {
  id: string;
  name: string;
  type: "folder" | "drive" | "site";
}

export interface DriveFile {
  remoteId: string;
  name: string;
  kind: FileKind;
  size: number | null;
}

export class DriveError extends Error {}

async function api<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } | string };
  if (!res.ok) {
    const msg = typeof json.error === "string" ? json.error : json.error?.message;
    throw new DriveError(res.status === 401 || res.status === 403 ? `The drive refused access (${res.status}): ${msg ?? "sign in again"}` : `Drive answered ${res.status}: ${msg ?? "no message"}`);
  }
  return json;
}

const G = "https://www.googleapis.com/drive/v3";
const GRAPH = "https://graph.microsoft.com/v1.0";
const GFOLDER = "application/vnd.google-apps.folder";
const GDOC = "application/vnd.google-apps.document";
const gq = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Folders (and, at the top, drives and sites) inside a location. An empty location lists the starting points. */
export async function browse(p: DriveProvider, token: string, location: string): Promise<DriveEntry[]> {
  if (p === "gdrive") {
    if (!location) {
      const drives = await api<{ drives?: { id: string; name: string }[] }>(token, `${G}/drives?pageSize=100`).catch(() => ({ drives: [] }));
      return [{ id: "root", name: "My Drive", type: "drive" as const }, ...(drives.drives ?? []).map((d) => ({ id: d.id, name: d.name, type: "drive" as const }))];
    }
    const out: DriveEntry[] = [];
    let page: string | undefined;
    do {
      const u = new URL(`${G}/files`);
      u.searchParams.set("q", `'${gq(location)}' in parents and trashed=false and mimeType='${GFOLDER}'`);
      u.searchParams.set("fields", "nextPageToken, files(id,name)");
      u.searchParams.set("pageSize", "1000");
      u.searchParams.set("orderBy", "name");
      u.searchParams.set("supportsAllDrives", "true");
      u.searchParams.set("includeItemsFromAllDrives", "true");
      u.searchParams.set("corpora", "allDrives");
      if (page) u.searchParams.set("pageToken", page);
      const r = await api<{ nextPageToken?: string; files?: { id: string; name: string }[] }>(token, u.toString());
      for (const f of r.files ?? []) out.push({ id: f.id, name: f.name, type: "folder" });
      page = r.nextPageToken;
    } while (page && out.length < 2000);
    return out;
  }

  // Microsoft: "" → my OneDrive + SharePoint sites · "site:<id>" → that site's libraries · "<driveId>:<itemId>" → folders
  if (!location) {
    const me = await api<{ id: string }>(token, `${GRAPH}/me/drive?$select=id`).catch(() => null);
    const sites = await api<{ value?: { id: string; displayName?: string; name?: string }[] }>(token, `${GRAPH}/sites?search=*&$top=100&$select=id,displayName,name`).catch(() => ({ value: [] }));
    return [
      ...(me ? [{ id: `${me.id}:root`, name: "My OneDrive", type: "drive" as const }] : []),
      ...(sites.value ?? []).map((s) => ({ id: `site:${s.id}`, name: s.displayName || s.name || "SharePoint site", type: "site" as const })),
    ];
  }
  if (location.startsWith("site:")) {
    const r = await api<{ value?: { id: string; name: string }[] }>(token, `${GRAPH}/sites/${encodeURIComponent(location.slice(5))}/drives?$select=id,name`);
    return (r.value ?? []).map((d) => ({ id: `${d.id}:root`, name: d.name, type: "drive" as const }));
  }
  const out: DriveEntry[] = [];
  let next: string | undefined = `${graphChildren(location)}?$select=id,name,folder&$top=999`;
  while (next && out.length < 2000) {
    const r: { value?: { id: string; name: string; folder?: unknown }[]; "@odata.nextLink"?: string } = await api(token, next);
    for (const f of r.value ?? []) if (f.folder) out.push({ id: `${location.split(":")[0]}:${f.id}`, name: f.name, type: "folder" });
    next = r["@odata.nextLink"];
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function graphChildren(location: string) {
  const [drive, item] = location.split(":");
  if (!drive || !item) throw new DriveError("Unknown folder.");
  return item === "root"
    ? `${GRAPH}/drives/${encodeURIComponent(drive)}/root/children`
    : `${GRAPH}/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item)}/children`;
}

/** One page of a folder: its files we can read, its sub-folders, and a cursor for the next page. */
export async function listPage(
  p: DriveProvider,
  token: string,
  folder: string,
  cursor: string | null,
): Promise<{ files: DriveFile[]; folders: DriveEntry[]; next: string | null }> {
  const files: DriveFile[] = [];
  const folders: DriveEntry[] = [];
  if (p === "gdrive") {
    const u = new URL(`${G}/files`);
    u.searchParams.set("q", `'${gq(folder)}' in parents and trashed=false`);
    u.searchParams.set("fields", "nextPageToken, files(id,name,mimeType,size)");
    u.searchParams.set("pageSize", "1000");
    u.searchParams.set("supportsAllDrives", "true");
    u.searchParams.set("includeItemsFromAllDrives", "true");
    u.searchParams.set("corpora", "allDrives");
    if (cursor) u.searchParams.set("pageToken", cursor);
    const r = await api<{ nextPageToken?: string; files?: { id: string; name: string; mimeType: string; size?: string }[] }>(token, u.toString());
    for (const f of r.files ?? []) {
      if (f.mimeType === GFOLDER) folders.push({ id: f.id, name: f.name, type: "folder" });
      // Native Google Docs are exported as PDF, so the page numbers in quotes still mean something.
      else if (f.mimeType === GDOC) files.push({ remoteId: `export:${f.id}`, name: `${f.name}.pdf`, kind: "pdf", size: null });
      else {
        const kind = fileKind(f.name, f.mimeType);
        if (kind) files.push({ remoteId: f.id, name: f.name, kind, size: f.size ? Number(f.size) : null });
      }
    }
    return { files, folders, next: r.nextPageToken ?? null };
  }
  const url = cursor ?? `${graphChildren(folder)}?$select=id,name,folder,file,size&$top=999`;
  const r = await api<{ value?: { id: string; name: string; folder?: unknown; file?: { mimeType?: string }; size?: number }[]; "@odata.nextLink"?: string }>(token, url);
  const drive = folder.split(":")[0];
  for (const f of r.value ?? []) {
    if (f.folder) folders.push({ id: `${drive}:${f.id}`, name: f.name, type: "folder" });
    else if (f.file) {
      const kind = fileKind(f.name, f.file.mimeType);
      if (kind) files.push({ remoteId: `${drive}:${f.id}`, name: f.name, kind, size: f.size ?? null });
    }
  }
  return { files, folders, next: r["@odata.nextLink"] ?? null };
}

/** The file's bytes. */
export async function downloadFile(p: DriveProvider, token: string, remoteId: string): Promise<Buffer> {
  let url: string;
  if (p === "gdrive") {
    url = remoteId.startsWith("export:")
      ? `${G}/files/${encodeURIComponent(remoteId.slice(7))}/export?mimeType=application/pdf`
      : `${G}/files/${encodeURIComponent(remoteId)}?alt=media&supportsAllDrives=true`;
  } else {
    const [drive, item] = remoteId.split(":");
    url = `${GRAPH}/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item)}/content`;
  }
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new DriveError(`Could not download the file from the drive (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}
