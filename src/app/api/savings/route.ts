import { NextResponse } from "next/server";
import { kindForRecommendation, KINDS, SOURCES, type SavingCandidate, type SavingOp } from "@/lib/billing/savings";
import { recommendationLabel, type Recommendation } from "@/lib/approvals";
import { canApproveRenewals, canWrite } from "@/lib/roles";
import { adminClient } from "@/lib/server/admin";
import { denyViewer, requireSession } from "@/lib/server/api";
import { logAudit } from "@/lib/server/audit";
import { getBilling } from "@/lib/server/billing";
import { billSaving, rowToSaving, SAVINGS_SETUP, savingsTableMissing, type SavingRow } from "@/lib/server/savings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The savings ledger for the current workspace (docs/savings-share.md). Members read it straight from the table;
// every write goes through here with the service role, after checking who may do it, so fees can't be edited
// from the browser.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e10 ? Math.round(v * 100) / 100 : null);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

type ContractLite = { id: string; vendor: string; annual_fee: number | string | null; currency: string | null; term_end: string | null };

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, session } = ctx;
  const ws = session.workspace.id;
  const [ledger, reviews, contracts, billing] = await Promise.all([
    supabase.from("savings_ledger").select("*").eq("workspace_id", ws).order("recorded_at", { ascending: false }),
    supabase
      .from("renewal_reviews")
      .select("id, contract_id, recommendation, expected_savings, decided_at, status")
      .eq("workspace_id", ws)
      .eq("status", "approved")
      .neq("recommendation", "keep"),
    supabase.from("contracts").select("id, vendor, annual_fee, currency, term_end").eq("workspace_id", ws).order("vendor"),
    getBilling(ws),
  ]);
  if (ledger.error) {
    if (savingsTableMissing(ledger.error.message)) return NextResponse.json({ savings: [], candidates: [], contracts: [], setupNeeded: SAVINGS_SETUP });
    return bad(ledger.error.message, 500);
  }
  const savings = ((ledger.data ?? []) as SavingRow[]).map(rowToSaving);
  const list = ((contracts.data ?? []) as ContractLite[]).map((c) => ({
    id: c.id,
    vendor: c.vendor,
    annualFee: c.annual_fee == null ? null : Number(c.annual_fee),
    currency: (c.currency || "USD").toUpperCase(),
    termEnd: c.term_end,
  }));
  const byId = new Map(list.map((c) => [c.id, c]));
  const used = new Set(savings.filter((s) => s.status !== "void" && s.reviewId).map((s) => s.reviewId));
  const candidates: SavingCandidate[] = ((reviews.data ?? []) as {
    id: string;
    contract_id: string;
    recommendation: Recommendation;
    expected_savings: number | string | null;
    decided_at: string | null;
  }[])
    .filter((r) => !used.has(r.id) && byId.has(r.contract_id))
    .map((r) => {
      const c = byId.get(r.contract_id)!;
      return {
        reviewId: r.id,
        contractId: r.contract_id,
        vendor: c.vendor,
        recommendation: recommendationLabel(r.recommendation),
        kind: kindForRecommendation(r.recommendation),
        currency: c.currency,
        baselineAnnual: c.annualFee,
        expectedSavings: r.expected_savings == null ? null : Number(r.expected_savings),
        baselineNote: c.annualFee ? "Current annual price on the contract" : "",
        decidedAt: r.decided_at,
      };
    });
  return NextResponse.json({
    savings,
    candidates,
    contracts: list,
    plan: billing.plan,
    onSavingsPlan: billing.plan === "savings" && (billing.state === "active" || billing.state === "past_due"),
    canRecord: canWrite(session.role),
    canConfirm: canApproveRenewals(session.role),
  });
}

export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const denied = denyViewer(ctx.session);
  if (denied) return denied;
  const { supabase, session } = ctx;
  const ws = session.workspace.id;
  const db = adminClient();
  if (!db) return bad("SUPABASE_SERVICE_ROLE_KEY is missing, so savings can't be saved.", 503);
  const body = (await req.json().catch(() => null)) as SavingOp | null;
  if (!body || typeof body !== "object") return bad("Bad request.");
  const now = new Date().toISOString();

  if (body.op === "record") {
    if (!SOURCES.some((s) => s.value === body.source)) return bad("Say which Outflow recommendation this saving came from.");
    if (!KINDS.some((k) => k.value === body.kind)) return bad("Pick what kind of saving it is.");
    const baseline = amount(body.baselineAnnual);
    const next = amount(body.newAnnual);
    if (!baseline || baseline <= 0) return bad("Enter what the next 12 months would have cost without the change.");
    if (next == null) return bad("Enter the new annual price (0 if cancelled).");
    if (next >= baseline) return bad("The new price has to be lower than the baseline to count as a saving.");
    const note = text(body.baselineNote, 500);
    if (!note) return bad("Say where the baseline comes from, for example the renewal quote.");
    const currency = text(body.currency, 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return bad("Pick a currency.");
    const signedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.signedOn ?? "")) ? String(body.signedOn) : null;

    let contractId = UUID.test(String(body.contractId ?? "")) ? String(body.contractId) : null;
    let reviewId: string | null = null;
    if (body.source === "approval") {
      if (!UUID.test(String(body.reviewId ?? ""))) return bad("Pick the approved renewal decision this saving came from.");
      const { data: review } = await db.from("renewal_reviews").select("id, contract_id, status, workspace_id").eq("id", body.reviewId!).maybeSingle();
      if (!review || review.workspace_id !== ws) return bad("Unknown renewal decision.");
      if (review.status !== "approved") return bad("That renewal decision hasn't been approved yet.");
      reviewId = review.id as string;
      contractId = review.contract_id as string;
    }
    if (!contractId) return bad("Pick the contract the saving is on.");
    const ids = [contractId, ...(UUID.test(String(body.newContractId ?? "")) ? [String(body.newContractId)] : [])];
    const { data: owned } = await db.from("contracts").select("id, vendor").eq("workspace_id", ws).in("id", ids);
    const contract = (owned ?? []).find((c) => c.id === contractId);
    if (!contract) return bad("Unknown contract.");
    const newContractId = ids[1] && (owned ?? []).some((c) => c.id === ids[1]) ? ids[1] : null;

    // The same contract can't be saved on twice in one renewal year.
    const { data: recent } = await db
      .from("savings_ledger")
      .select("id")
      .eq("contract_id", contractId)
      .neq("status", "void")
      .gte("recorded_at", new Date(Date.now() - 300 * 86_400_000).toISOString())
      .limit(1);
    if (recent?.length) return bad("A saving is already recorded on this contract for this renewal. Withdraw it first if it needs to change.", 409);

    const { data, error } = await db
      .from("savings_ledger")
      .insert({
        workspace_id: ws,
        contract_id: contractId,
        review_id: reviewId,
        new_contract_id: newContractId,
        vendor: text(body.vendor, 200) || (contract.vendor as string),
        source: body.source,
        kind: body.kind,
        currency,
        baseline_annual: baseline,
        new_annual: next,
        baseline_note: note,
        evidence: text(body.evidence, 4000) || null,
        signed_on: signedOn,
        recorded_by: session.userId,
        recorded_by_email: session.email || null,
      })
      .select("*")
      .single();
    if (error) {
      if (savingsTableMissing(error.message)) return bad(SAVINGS_SETUP, 503);
      if (/duplicate|unique/i.test(error.message)) return bad("That renewal decision already has a saving recorded.", 409);
      return bad(error.message, 500);
    }
    const row = data as SavingRow;
    await logAudit(supabase, ws, {
      action: "saving.recorded",
      targetType: "saving",
      targetId: row.id,
      targetLabel: row.vendor,
      details: { annual_saving: Number(row.annual_saving), currency },
    });
    return NextResponse.json({ ok: true, saving: rowToSaving(row) });
  }

  if (!UUID.test(String((body as { id?: unknown }).id ?? ""))) return bad("Unknown saving.");
  const { data: existing } = await db.from("savings_ledger").select("*").eq("id", body.id).maybeSingle();
  const row = existing as SavingRow | null;
  if (!row || row.workspace_id !== ws) return bad("Unknown saving.", 404);
  const label = { targetType: "saving", targetId: row.id, targetLabel: row.vendor };

  if (body.op === "confirm") {
    if (!canApproveRenewals(session.role)) return bad("Only admins and Finance approvers can confirm savings.", 403);
    // Only one confirm can win, so the fee is never invoiced twice.
    const { data, error } = await db
      .from("savings_ledger")
      .update({ status: "confirmed", confirmed_by: session.userId, confirmed_by_email: session.email || null, confirmed_at: now, dispute_note: null, updated_at: now })
      .eq("id", row.id)
      .in("status", ["pending", "disputed"])
      .select("*")
      .maybeSingle();
    if (error) return bad(error.message, 500);
    if (!data) return bad("This saving was already confirmed or withdrawn.", 409);
    const result = await billSaving(data as SavingRow);
    await logAudit(supabase, ws, { action: "saving.confirmed", ...label, details: { annual_saving: Number(row.annual_saving), fee_status: result.feeStatus } });
    return NextResponse.json({ ok: true, ...result });
  }

  if (body.op === "dispute") {
    if (!canApproveRenewals(session.role)) return bad("Only admins and Finance approvers can dispute savings.", 403);
    const note = text(body.note, 2000);
    if (!note) return bad("Say what's wrong with this saving.");
    const { data } = await db
      .from("savings_ledger")
      .update({ status: "disputed", dispute_note: note, updated_at: now })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!data) return bad("Only savings waiting for confirmation can be disputed.", 409);
    await logAudit(supabase, ws, { action: "saving.disputed", ...label, details: { note } });
    return NextResponse.json({ ok: true });
  }

  if (body.op === "withdraw") {
    const mine = row.recorded_by_email && row.recorded_by_email.toLowerCase() === session.email.toLowerCase();
    if (!mine && !canApproveRenewals(session.role)) return bad("Only the person who recorded it, an admin or a Finance approver can withdraw it.", 403);
    const { data } = await db
      .from("savings_ledger")
      .update({ status: "void", updated_at: now })
      .eq("id", row.id)
      .in("status", ["pending", "disputed"])
      .select("id")
      .maybeSingle();
    if (!data) return bad("A confirmed saving can't be withdrawn. Contact support if it was confirmed by mistake.", 409);
    await logAudit(supabase, ws, { action: "saving.withdrawn", ...label });
    return NextResponse.json({ ok: true });
  }

  if (body.op === "retry_invoice") {
    if (session.role !== "owner") return bad("Only workspace admins can retry an invoice.", 403);
    if (row.status !== "confirmed" || row.fee_status !== "failed" || row.stripe_invoice_id) {
      return bad(row.stripe_invoice_id ? "The invoice exists. Pay it from the invoice link, or update your card in Billing." : "Nothing to retry.", 409);
    }
    const result = await billSaving(row);
    return NextResponse.json({ ok: true, ...result });
  }

  return bad("Unknown operation.");
}
