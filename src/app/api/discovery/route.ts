import { NextResponse } from "next/server";
import { buildItems, importDescription, importSeats } from "@/lib/discovery/build";
import { PROVIDERS, type DiscoveryData, type DiscoveryOp, type DiscoveryState, type ProviderId, type Signal } from "@/lib/discovery/types";
import { requireSession } from "@/lib/server/api";
import { encryptionBlocker, isConfigured } from "@/lib/server/connectors/config";
import { canClassify } from "@/lib/server/connectors/classify";
import { missingTables } from "@/lib/server/connectors/sync";

export const runtime = "nodejs";

type Ctx = Exclude<Awaited<ReturnType<typeof requireSession>>, NextResponse>;

const SIGNAL_COLS =
  "provider, vendor_key, name, category, dept_hint, kind, annual_spend, payment_count, last_seen, cadence, currency, users, licensed, dept_counts, evidence";

async function load({ supabase, session }: Ctx): Promise<DiscoveryData> {
  const ws = session.workspace.id;
  const [c, s, st] = await Promise.all([
    supabase.from("connections").select("provider, status, account_name, last_synced_at, last_error, summary").eq("workspace_id", ws),
    supabase.from("discovery_signals").select(SIGNAL_COLS).eq("workspace_id", ws),
    supabase.from("discovered_tools").select("vendor_key, status, department_id, department_set, tool_id").eq("workspace_id", ws),
  ]);
  const err = [c, s, st].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const blockers: string[] = [];
  const enc = encryptionBlocker();
  if (enc) blockers.push(enc);
  return {
    configured: Object.fromEntries(PROVIDERS.map((p) => [p.id, isConfigured(p.id)])) as Record<ProviderId, boolean>,
    blockers,
    connections: (c.data ?? []) as DiscoveryData["connections"],
    signals: ((s.data ?? []) as Signal[]).map((x) => ({
      ...x,
      annual_spend: x.annual_spend == null ? null : Number(x.annual_spend),
    })),
    states: (st.data ?? []) as DiscoveryState[],
  };
}

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json({ ...(await load(ctx)), aiMatching: canClassify() });
  } catch (e) {
    return NextResponse.json({ error: missingTables((e as Error).message) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.session.role !== "owner") return NextResponse.json({ ok: false, error: "Only admins can review discovered tools." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as DiscoveryOp | null;
  if (!body || typeof body.op !== "string") return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  try {
    const r = await run(ctx, body);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: missingTables((e as Error).message) }, { status: 500 });
  }
}

async function run(ctx: Ctx, body: DiscoveryOp): Promise<{ ok: boolean; error?: string; added?: number; linked?: number }> {
  const { supabase, session } = ctx;
  const ws = session.workspace.id;
  const now = new Date().toISOString();
  const keys = (list: unknown) => (Array.isArray(list) ? list.map(String).filter(Boolean).slice(0, 500) : []);
  const setState = async (rows: Partial<DiscoveryState>[]) => {
    if (!rows.length) return;
    const { error } = await supabase
      .from("discovered_tools")
      .upsert(rows.map((r) => ({ ...r, workspace_id: ws, updated_at: now })), { onConflict: "workspace_id,vendor_key" });
    if (error) throw new Error(error.message);
  };

  switch (body.op) {
    case "dismiss":
      await setState(keys(body.vendor_keys).map((vendor_key) => ({ vendor_key, status: "dismissed" as const })));
      return { ok: true };
    case "restore":
      await setState(keys(body.vendor_keys).map((vendor_key) => ({ vendor_key, status: "new" as const, tool_id: null })));
      return { ok: true };
    case "setDepartment":
      await setState([{ vendor_key: String(body.vendor_key), department_id: body.department_id || null, department_set: true }]);
      return { ok: true };
    case "import": {
      const wanted = new Map((Array.isArray(body.items) ? body.items : []).slice(0, 500).map((i) => [String(i.vendor_key), i.department_id || null]));
      if (!wanted.size) return { ok: false, error: "Pick at least one tool." };
      const [data, d, t] = await Promise.all([
        load(ctx),
        supabase.from("departments").select("id, name").eq("workspace_id", ws),
        supabase.from("tools").select("id, name, annual_cost, seats").eq("workspace_id", ws),
      ]);
      if (d.error || t.error) throw new Error((d.error ?? t.error)!.message);
      const deptIds = new Set((d.data ?? []).map((x) => x.id));
      const tools = t.data ?? [];
      const items = buildItems(data, d.data ?? [], tools).filter((i) => wanted.has(i.vendor_key) && i.status !== "imported");

      let added = 0;
      let linked = 0;
      const states: Partial<DiscoveryState>[] = [];
      for (const item of items) {
        const requested = wanted.get(item.vendor_key) ?? null;
        const department_id = requested && deptIds.has(requested) ? requested : null;
        const annual = item.annual_spend != null ? Math.round(item.annual_spend) : null;
        const seats = importSeats(item);
        if (item.existing_tool_id) {
          // Already on the list (added by hand or from a contract): fill the blanks instead of duplicating it.
          const existing = tools.find((x) => x.id === item.existing_tool_id);
          const patch: Record<string, unknown> = {};
          if (existing?.annual_cost == null && annual != null) patch.annual_cost = annual;
          if (existing?.seats == null && seats != null) patch.seats = seats;
          if (Object.keys(patch).length) await supabase.from("tools").update({ ...patch, updated_at: now }).eq("id", item.existing_tool_id).eq("workspace_id", ws);
          states.push({ vendor_key: item.vendor_key, status: "imported", tool_id: item.existing_tool_id, department_id });
          linked++;
          continue;
        }
        const { data: row, error } = await supabase
          .from("tools")
          .insert({
            workspace_id: ws,
            name: item.name.slice(0, 120),
            category: item.category,
            department_id,
            description: importDescription(item),
            annual_cost: annual,
            seats,
            source: "import",
            confirmed: false, // the department owner confirms it on Tools & survey
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        states.push({ vendor_key: item.vendor_key, status: "imported", tool_id: row.id, department_id });
        added++;
      }
      await setState(states);
      return { ok: true, added, linked };
    }
    default:
      return { ok: false, error: "Unknown operation." };
  }
}
