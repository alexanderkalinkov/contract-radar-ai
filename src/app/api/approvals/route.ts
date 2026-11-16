import { NextResponse } from "next/server";
import { canApproveRenewals, RECOMMENDATIONS, reviewSummary, type ApprovalOp, type RenewalReview, type ReviewEvent } from "@/lib/approvals";
import { brand } from "@/lib/email/brand";
import { approvalDecisionEmail, approvalRequestEmail } from "@/lib/email/templates";
import { denyViewer, requireSession } from "@/lib/server/api";
import { sendEmail } from "@/lib/server/mailer";
import { parseRole } from "@/lib/roles";

// Renewal approvals for the current workspace. Reads come straight from the tables (members can read);
// every write goes through a SQL function that checks who may do it and logs the step
// (supabase/migrations/20261116220000_renewal_approvals.sql).

const SETUP = "Run supabase/migrations/20261116220000_renewal_approvals.sql in the Supabase SQL editor first.";
const missing = (msg: string) => /renewal_review|submit_renewal|decide_renewal|reopen_renewal|schema cache/.test(msg);

type ReviewRow = {
  id: string;
  contract_id: string;
  cycle: string;
  recommendation: RenewalReview["recommendation"];
  reason: string;
  target_seats: number | null;
  consolidate_into: string | null;
  expected_savings: number | string | null;
  status: RenewalReview["status"];
  recommended_by_email: string | null;
  recommended_at: string;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_note: string | null;
  contracts?: { vendor: string } | null;
};
type EventRow = {
  id: string;
  review_id: string;
  action: ReviewEvent["action"];
  actor_email: string | null;
  recommendation: ReviewEvent["recommendation"];
  expected_savings: number | string | null;
  note: string | null;
  created_at: string;
};

const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));

function toReview(r: ReviewRow, events: EventRow[]): RenewalReview {
  return {
    id: r.id,
    contractId: r.contract_id,
    cycle: r.cycle,
    vendor: r.contracts?.vendor ?? "",
    recommendation: r.recommendation,
    reason: r.reason,
    targetSeats: r.target_seats,
    consolidateInto: r.consolidate_into,
    expectedSavings: num(r.expected_savings),
    status: r.status,
    recommendedByEmail: r.recommended_by_email,
    recommendedAt: r.recommended_at,
    decidedByEmail: r.decided_by_email,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    events: events
      .filter((e) => e.review_id === r.id)
      .map((e) => ({
        id: e.id,
        action: e.action,
        actorEmail: e.actor_email,
        at: e.created_at,
        recommendation: e.recommendation,
        expectedSavings: num(e.expected_savings),
        note: e.note,
      })),
  };
}

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const ws = ctx.session.workspace.id;
  const [r, e] = await Promise.all([
    ctx.supabase.from("renewal_reviews").select("*, contracts(vendor)").eq("workspace_id", ws).order("updated_at", { ascending: false }),
    ctx.supabase.from("renewal_review_events").select("*").eq("workspace_id", ws).order("created_at", { ascending: true }),
  ]);
  const err = r.error ?? e.error;
  if (err) {
    if (missing(err.message)) return NextResponse.json({ reviews: [], setupNeeded: SETUP });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  const events = (e.data ?? []) as EventRow[];
  return NextResponse.json({ reviews: ((r.data ?? []) as ReviewRow[]).map((x) => toReview(x, events)) });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const optNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const denied = denyViewer(ctx.session);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as ApprovalOp | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { supabase, session } = ctx;
  const ws = session.workspace.id;

  let result;
  if (body.op === "recommend") {
    if (!UUID.test(String(body.contractId))) return NextResponse.json({ error: "Unknown contract." }, { status: 400 });
    if (!RECOMMENDATIONS.some((x) => x.value === body.recommendation)) return NextResponse.json({ error: "Pick a recommendation." }, { status: 400 });
    const reason = text(body.reason, 2000);
    if (!reason) return NextResponse.json({ error: "Say why, so the approver can decide." }, { status: 400 });
    const cycle = /^\d{4}-\d{2}-\d{2}$/.test(String(body.cycle)) ? String(body.cycle) : "open";
    result = await supabase.rpc("submit_renewal_recommendation", {
      p_contract: body.contractId,
      p_cycle: cycle,
      p_recommendation: body.recommendation,
      p_reason: reason,
      p_target_seats: body.recommendation === "cut_seats" && typeof body.targetSeats === "number" ? Math.max(0, Math.round(body.targetSeats)) : null,
      p_consolidate_into: body.recommendation === "consolidate" ? text(body.consolidateInto, 120) || null : null,
      p_expected_savings: body.recommendation === "keep" ? null : optNum(body.expectedSavings),
    });
  } else if (body.op === "decide") {
    if (!UUID.test(String(body.reviewId)) || (body.decision !== "approved" && body.decision !== "rejected")) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    result = await supabase.rpc("decide_renewal_review", { p_review: body.reviewId, p_decision: body.decision, p_note: text(body.note, 2000) || null });
  } else if (body.op === "reopen") {
    if (!UUID.test(String(body.reviewId))) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    result = await supabase.rpc("reopen_renewal_review", { p_review: body.reviewId, p_note: text(body.note, 2000) || null });
  } else {
    return NextResponse.json({ error: "Unknown operation." }, { status: 400 });
  }

  if (result.error) {
    if (missing(result.error.message)) return NextResponse.json({ error: SETUP }, { status: 500 });
    return NextResponse.json({ error: result.error.message.replace(/^./, (c) => c.toUpperCase()) }, { status: 400 });
  }
  const row = result.data as ReviewRow;

  // Email the next person in the loop. Failures don't undo the decision.
  let emailed: string[] = [];
  if (body.op !== "reopen") emailed = await notify(row, body.op === "decide" ? body : null).catch(() => []);
  return NextResponse.json({ ok: true, id: row.id, emailed });

  async function notify(r: ReviewRow, decision: Extract<ApprovalOp, { op: "decide" }> | null): Promise<string[]> {
    if (!process.env.RESEND_API_KEY) return [];
    const [{ data: contract }, { data: members }] = await Promise.all([
      supabase.from("contracts").select("vendor, notice_deadline, term_end").eq("id", r.contract_id).maybeSingle(),
      supabase.from("workspace_members").select("email, role").eq("workspace_id", ws),
    ]);
    const me = session.email.toLowerCase();
    const input = {
      workspace: session.workspace.name,
      contractId: r.contract_id,
      vendor: contract?.vendor ?? "Contract",
      summary: reviewSummary({
        recommendation: r.recommendation,
        targetSeats: r.target_seats,
        consolidateInto: r.consolidate_into,
        expectedSavings: num(r.expected_savings),
      }),
      reason: r.reason,
      decideBy: contract?.notice_deadline ?? contract?.term_end ?? null,
      recommendedBy: r.recommended_by_email,
    };
    const b = brand(new URL(req.url).origin);
    let to: string[];
    let email;
    if (!decision) {
      to = ((members ?? []) as { email: string; role: string }[]).filter((m) => canApproveRenewals(parseRole(m.role))).map((m) => m.email.toLowerCase()).filter((e) => e !== me);
      email = approvalRequestEmail(b, input);
    } else {
      const rec = r.recommended_by_email?.toLowerCase();
      to = rec && rec !== me ? [rec] : [];
      email = approvalDecisionEmail(b, { ...input, decision: decision.decision, decidedBy: r.decided_by_email, note: r.decision_note });
    }
    const sent: string[] = [];
    for (const addr of [...new Set(to)]) {
      const res = await sendEmail(addr, email, { tags: { type: decision ? "approval_decision" : "approval_request" }, replyTo: session.email || undefined });
      if (res.ok) sent.push(addr);
    }
    return sent;
  }
}
