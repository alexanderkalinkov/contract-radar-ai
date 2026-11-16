import { NextResponse } from "next/server";
import { canWrite } from "@/lib/roles";
import { denyViewer, requireSession } from "@/lib/server/api";
import { CURRENCIES, type CostCentre, type EntitiesData, type Entity, type EntityOp } from "@/lib/enterprise/types";

type Ctx = Exclude<Awaited<ReturnType<typeof requireSession>>, NextResponse>;

const MIGRATION = "Run supabase/migrations/20261116230000_audit_entities_sso.sql in the Supabase SQL editor to turn on entities and cost centres.";
const missing = (msg: string) => (/relation .* does not exist|Could not find the (table|.*column)|schema cache|entity_id|cost_centre_id/i.test(msg) ? MIGRATION : msg);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const ws = ctx.session.workspace.id;
  const [e, c, k] = await Promise.all([
    ctx.supabase.from("entities").select("id, name, code, currency, country").eq("workspace_id", ws).order("name"),
    ctx.supabase.from("cost_centres").select("id, entity_id, code, name").eq("workspace_id", ws).order("code"),
    ctx.supabase.from("contracts").select("id, entity_id, cost_centre_id, annual_fee, currency").eq("workspace_id", ws).eq("demo", false),
  ]);
  const err = [e, c, k].find((r) => r.error)?.error;
  if (err) return NextResponse.json({ error: missing(err.message) }, { status: 500 });

  const entities = (e.data ?? []) as Entity[];
  const currencyOf = new Map(entities.map((x) => [x.id, x.currency]));
  const assignments: EntitiesData["assignments"] = {};
  const spend: EntitiesData["spend"] = {};
  for (const row of k.data ?? []) {
    assignments[row.id] = { entity_id: row.entity_id, cost_centre_id: row.cost_centre_id };
    const key = row.entity_id ?? "none";
    const cur = row.currency || (row.entity_id ? currencyOf.get(row.entity_id) : null) || "USD";
    const fee = Number(row.annual_fee) || 0;
    spend[key] = spend[key] ?? {};
    spend[key][cur] = (spend[key][cur] ?? 0) + fee;
  }
  const data: EntitiesData = {
    entities,
    costCentres: (c.data ?? []) as CostCentre[],
    assignments,
    spend,
    canManage: ctx.session.role === "owner",
    canAssign: canWrite(ctx.session.role),
  };
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const readOnly = denyViewer(ctx.session);
  if (readOnly) return readOnly;
  const body = (await req.json().catch(() => null)) as EntityOp | null;
  if (!body || typeof body.op !== "string") return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  const r = await run(ctx, body);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

const cleanCurrency = (v: unknown) => {
  const c = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
};
const cleanCountry = (v: unknown) => {
  const c = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
};

async function run({ supabase, session }: Ctx, body: EntityOp): Promise<{ ok: boolean; error?: string; id?: string }> {
  const ws = session.workspace.id;
  const isAdmin = session.role === "owner";
  const fail = (error: { message: string } | null) => (error ? { ok: false, error: missing(error.message) } : { ok: true });
  if (body.op !== "assignContract" && !isAdmin) return { ok: false, error: "Only admins can change entities and cost centres." };

  switch (body.op) {
    case "addEntity": {
      const name = String(body.name ?? "").trim().slice(0, 80);
      if (!name) return { ok: false, error: "Give the entity a name, for example a brand or subsidiary." };
      const currency = cleanCurrency(body.currency);
      if (!currency) return { ok: false, error: `Pick a currency, for example ${CURRENCIES.slice(0, 3).join(", ")}.` };
      const { data, error } = await supabase
        .from("entities")
        .insert({ workspace_id: ws, name, code: String(body.code ?? "").trim().slice(0, 20) || null, currency, country: cleanCountry(body.country) })
        .select("id")
        .single();
      if (error) return /duplicate|unique/i.test(error.message) ? { ok: false, error: `There's already an entity called ${name}.` } : fail(error);
      return { ok: true, id: data.id };
    }
    case "updateEntity": {
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name).trim().slice(0, 80);
        if (!name) return { ok: false, error: "Give the entity a name." };
        patch.name = name;
      }
      if (body.code !== undefined) patch.code = String(body.code ?? "").trim().slice(0, 20) || null;
      if (body.currency !== undefined) {
        const c = cleanCurrency(body.currency);
        if (!c) return { ok: false, error: "Currency must be a 3-letter code like EUR." };
        patch.currency = c;
      }
      if (body.country !== undefined) patch.country = cleanCountry(body.country);
      if (!Object.keys(patch).length) return { ok: false, error: "Nothing to update." };
      return fail((await supabase.from("entities").update(patch).eq("id", body.id).eq("workspace_id", ws)).error);
    }
    case "deleteEntity":
      return fail((await supabase.from("entities").delete().eq("id", body.id).eq("workspace_id", ws)).error);
    case "addCostCentre": {
      const code = String(body.code ?? "").trim().slice(0, 30);
      if (!code) return { ok: false, error: "Give the cost centre a code, for example CC-4100." };
      if (!UUID.test(String(body.entity_id))) return { ok: false, error: "Pick an entity." };
      const { data, error } = await supabase
        .from("cost_centres")
        .insert({ workspace_id: ws, entity_id: body.entity_id, code, name: String(body.name ?? "").trim().slice(0, 80) || null })
        .select("id")
        .single();
      if (error) return /duplicate|unique/i.test(error.message) ? { ok: false, error: `${code} already exists in that entity.` } : fail(error);
      return { ok: true, id: data.id };
    }
    case "deleteCostCentre":
      return fail((await supabase.from("cost_centres").delete().eq("id", body.id).eq("workspace_id", ws)).error);
    case "assignContract": {
      if (!UUID.test(String(body.contract_id))) return { ok: false, error: "Unknown contract." };
      const entity_id = body.entity_id && UUID.test(body.entity_id) ? body.entity_id : null;
      const cost_centre_id = body.cost_centre_id && UUID.test(body.cost_centre_id) ? body.cost_centre_id : null;
      const { data, error } = await supabase
        .from("contracts")
        .update({ entity_id, cost_centre_id })
        .eq("id", body.contract_id)
        .eq("workspace_id", ws)
        .select("id");
      if (error) return fail(error);
      if (!data?.length) return { ok: false, error: "You can't change that contract." };
      // Keep the matching tool on the same books.
      await supabase.from("tools").update({ entity_id, cost_centre_id }).eq("contract_id", body.contract_id).eq("workspace_id", ws);
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown operation." };
  }
}
