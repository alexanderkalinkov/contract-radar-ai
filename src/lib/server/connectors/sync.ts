import "server-only";
import { aggregateSpend, maybeSoftware, obviousSoftware, spendSignal, usageSignal } from "@/lib/discovery/build";
import { matchVendor } from "@/lib/discovery/catalog";
import type { ConnectionInfo, ProviderId, Signal } from "@/lib/discovery/types";
import type { createClient } from "@/lib/supabase/server";
import { classifyVendors } from "./classify";
import { decrypt, encrypt } from "./config";
import { fetchProvider, ProviderError } from "./fetchers";
import { refreshTokens, type Tokens } from "./oauth";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const missingTables = (msg: string) =>
  /relation .* does not exist|Could not find the table|schema cache/i.test(msg)
    ? "The auto-discovery tables aren't in the database yet. Run supabase/migrations/20261116000000_auto_discovery.sql in the Supabase SQL editor."
    : msg;

export { missingTables };

/** Save a fresh connection after the OAuth callback. */
export async function saveConnection(supabase: Supabase, ws: string, provider: ProviderId, tokens: Tokens, externalId: string | null) {
  const { data: conn, error } = await supabase
    .from("connections")
    .upsert(
      { workspace_id: ws, provider, status: "connected", external_id: externalId, last_error: null, updated_at: new Date().toISOString() },
      { onConflict: "workspace_id,provider" },
    )
    .select("id")
    .single();
  if (error) throw new Error(missingTables(error.message));
  await saveTokens(supabase, ws, conn.id, tokens);
  return conn.id as string;
}

async function saveTokens(supabase: Supabase, ws: string, connectionId: string, t: Tokens) {
  const { error } = await supabase.from("connection_secrets").upsert(
    {
      connection_id: connectionId,
      workspace_id: ws,
      access_token: encrypt(t.access_token),
      refresh_token: t.refresh_token ? encrypt(t.refresh_token) : null,
      expires_at: t.expires_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (error) throw new Error(missingTables(error.message));
}

export async function loadTokens(supabase: Supabase, ws: string, provider: ProviderId) {
  const { data: conn, error } = await supabase.from("connections").select("id, external_id").eq("workspace_id", ws).eq("provider", provider).maybeSingle();
  if (error) throw new Error(missingTables(error.message));
  if (!conn) return null;
  const { data: sec } = await supabase.from("connection_secrets").select("access_token, refresh_token, expires_at").eq("connection_id", conn.id).maybeSingle();
  if (!sec) return { conn, tokens: null };
  return {
    conn,
    tokens: {
      access_token: decrypt(sec.access_token),
      refresh_token: sec.refresh_token ? decrypt(sec.refresh_token) : null,
      expires_at: sec.expires_at as string,
    } satisfies Tokens,
  };
}

/** Pull from one provider, rebuild its signals and record how it went on the connection. */
export async function syncProvider(supabase: Supabase, ws: string, provider: ProviderId): Promise<{ ok: boolean; error?: string; summary?: ConnectionInfo["summary"] }> {
  const loaded = await loadTokens(supabase, ws, provider);
  if (!loaded) return { ok: false, error: "Not connected." };
  const { conn } = loaded;
  const fail = async (message: string) => {
    await supabase.from("connections").update({ status: "error", last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", conn.id);
    return { ok: false, error: message };
  };
  if (!loaded.tokens) return fail("The sign-in for this connection is missing. Disconnect and connect again.");

  try {
    let tokens = loaded.tokens;
    if (Date.parse(tokens.expires_at) < Date.now() + 120_000) {
      if (!tokens.refresh_token) return fail("The sign-in expired. Disconnect and connect again.");
      tokens = await refreshTokens(provider, tokens.refresh_token);
      await saveTokens(supabase, ws, conn.id, tokens);
    }

    const result = await fetchProvider(provider, tokens.access_token, conn.external_id ?? null);
    const signals = await toSignals(provider, result);

    const del = await supabase.from("discovery_signals").delete().eq("workspace_id", ws).eq("provider", provider);
    if (del.error) throw new Error(missingTables(del.error.message));
    if (signals.length) {
      const ins = await supabase.from("discovery_signals").insert(signals.map((s) => ({ ...s, workspace_id: ws })));
      if (ins.error) throw new Error(missingTables(ins.error.message));
    }
    const summary = {
      tools: signals.length,
      spend: Math.round(signals.reduce((s, x) => s + (x.annual_spend ?? 0), 0)),
      users: result.usage ? new Set([...result.usage.apps.flatMap((a) => [...a.users])]).size : undefined,
    };
    await supabase
      .from("connections")
      .update({
        status: "connected",
        account_name: result.account_name,
        external_id: result.external_id ?? conn.external_id ?? null,
        last_synced_at: new Date().toISOString(),
        last_error: null,
        summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    return { ok: true, summary };
  } catch (e) {
    const err = e as Error;
    let msg = err.message;
    if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) {
      msg =
        provider === "google"
          ? `Google refused access (${e.message}). Connect with a Google Workspace super admin account.`
          : provider === "microsoft"
            ? `Microsoft refused access (${e.message}). Connect with a Global Administrator, or have one grant admin consent.`
            : `${e.message}. Try disconnecting and connecting again.`;
    }
    return fail(missingTables(msg));
  }
}

async function toSignals(provider: ProviderId, result: Awaited<ReturnType<typeof fetchProvider>>): Promise<Signal[]> {
  const out: Signal[] = [];
  if (result.spend) {
    const candidates = aggregateSpend(result.spend);
    const unsure = candidates.filter((c) => !c.match.known && (c.hinted || maybeSoftware(c)));
    const verdict = await classifyVendors(
      unsure.map((c) => ({ name: c.rawNames[0], context: `${c.count} payments, ${Math.round(c.total12m)} ${c.currency ?? ""} in 12 months` })),
    );
    for (const c of candidates) {
      if (c.match.known) {
        out.push(spendSignal(provider, c));
        continue;
      }
      const v = verdict?.get(c.rawNames[0]);
      if (v) {
        if (!v.is_software) continue;
        // Claude's clean name may match the catalogue ("SLACK T0123" → "Slack"): re-key so it merges with sign-in data.
        const m = matchVendor(v.name);
        const sig = spendSignal(provider, c, { name: m.known ? m.name : v.name, category: m.known ? m.category : v.category, dept: m.known ? m.dept : v.dept });
        out.push({ ...sig, vendor_key: m.known ? m.key : sig.vendor_key });
      } else if (obviousSoftware(c) || (!verdict && maybeSoftware(c))) {
        out.push(spendSignal(provider, c));
      }
    }
  }
  if (result.usage) {
    const { apps, deptOf, windowDays } = result.usage;
    const unknown = apps.filter((a) => !matchVendor(a.name).known);
    const verdict = await classifyVendors(unknown.map((a) => ({ name: a.name, context: "app people sign in to with company SSO" })));
    for (const a of apps) {
      const v = verdict?.get(a.name);
      if (v && !v.is_software) continue;
      const sig = usageSignal(provider, a, deptOf, windowDays, v ? { name: v.name, category: v.category, dept: v.dept } : undefined);
      if (!(sig.users || sig.licensed)) continue;
      out.push(sig);
    }
  }
  // One row per vendor per provider: merge duplicates (e.g. two Xero contacts for the same vendor).
  const merged = new Map<string, Signal>();
  for (const s of out) {
    const prev = merged.get(s.vendor_key);
    if (!prev) merged.set(s.vendor_key, s);
    else
      merged.set(s.vendor_key, {
        ...prev,
        annual_spend: prev.annual_spend != null || s.annual_spend != null ? (prev.annual_spend ?? 0) + (s.annual_spend ?? 0) : null,
        payment_count: prev.payment_count != null || s.payment_count != null ? (prev.payment_count ?? 0) + (s.payment_count ?? 0) : null,
        users: Math.max(prev.users ?? 0, s.users ?? 0) || null,
        licensed: Math.max(prev.licensed ?? 0, s.licensed ?? 0) || null,
        last_seen: [prev.last_seen, s.last_seen].filter(Boolean).sort().at(-1) ?? null,
      });
  }
  return [...merged.values()];
}
