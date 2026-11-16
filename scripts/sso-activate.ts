// Turns on SAML single sign-on for a customer who requested it in Workspace settings.
// You (the platform operator) run this after checking the customer really owns the email domain.
//
//   npm run sso:activate                  lists requests waiting for activation
//   npm run sso:activate -- acme.com      registers acme.com's identity provider in Supabase Auth and marks it active
//   npm run sso:activate -- acme.com off  removes the provider from Supabase Auth and marks it disabled
//
// Needs in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already there)
//   SUPABASE_ACCESS_TOKEN  a personal access token from supabase.com/dashboard/account/tokens
// The Supabase project must be on a plan with SAML SSO, and SAML must be enabled under
// Authentication → Sign In / Providers → SAML 2.0. Then set SSO_ENABLED=true in Vercel.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const ref = new URL(url).hostname.split(".")[0];
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const [domainArg, action] = process.argv.slice(2);

async function management(path: string, init: RequestInit = {}) {
  if (!token) {
    console.error("Set SUPABASE_ACCESS_TOKEN in .env.local (supabase.com/dashboard/account/tokens).");
    process.exit(1);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase Management API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!domainArg) {
    const { data, error } = await db
      .from("workspace_sso")
      .select("domain, status, metadata_url, default_role, created_at, workspaces(name)")
      .order("created_at");
    if (error) throw new Error(error.message);
    if (!data?.length) return console.log("No SSO requests yet.");
    for (const r of data) {
      const ws = (r.workspaces as unknown as { name: string } | null)?.name ?? "?";
      console.log(`${r.status.padEnd(10)} ${r.domain.padEnd(28)} ${ws}  (joins as ${r.default_role})\n           ${r.metadata_url}`);
    }
    return;
  }

  const domain = domainArg.toLowerCase();
  const { data: row, error } = await db.from("workspace_sso").select("*").eq("domain", domain).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error(`Nobody has requested SSO for ${domain}.`);

  if (action === "off") {
    if (row.provider_id) await management(`/config/auth/sso/providers/${row.provider_id}`, { method: "DELETE" });
    await db.from("workspace_sso").update({ status: "disabled", provider_id: null, enforce: false }).eq("id", row.id);
    return console.log(`SSO for ${domain} is off. People there sign in with email and password again.`);
  }

  if (!row.metadata_url) throw new Error(`${domain} has no metadata URL yet.`);
  let providerId: string | null = row.provider_id;
  if (providerId) {
    await management(`/config/auth/sso/providers/${providerId}`, {
      method: "PUT",
      body: JSON.stringify({ metadata_url: row.metadata_url, domains: [domain] }),
    });
  } else {
    const created = await management(`/config/auth/sso/providers`, {
      method: "POST",
      body: JSON.stringify({ type: "saml", metadata_url: row.metadata_url, domains: [domain] }),
    });
    providerId = created?.id ?? null;
  }
  const { error: upErr } = await db
    .from("workspace_sso")
    .update({ status: "active", provider_id: providerId, activated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (upErr) throw new Error(upErr.message);
  console.log(`SSO for ${domain} is active (provider ${providerId}). They can now use "Sign in with SSO".`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
