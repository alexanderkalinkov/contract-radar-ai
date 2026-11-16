import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/api";
import { sendInviteEmail } from "@/lib/server/invite-email";
import { guessCategory, type OpResult, type TeamData, type TeamOp, type ToolInput } from "@/lib/team/types";

type Ctx = Exclude<Awaited<ReturnType<typeof requireSession>>, NextResponse>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const missingTables = (msg: string) =>
  /relation .* does not exist|Could not find the table|schema cache/i.test(msg)
    ? "The team tables aren't in the database yet. Run supabase/migrations/20261115120000_team_onboarding.sql in the Supabase SQL editor."
    : msg;

export async function GET() {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  try {
    await syncUploads(ctx);
    return NextResponse.json(await load(ctx));
  } catch (e) {
    return NextResponse.json({ error: missingTables((e as Error).message) }, { status: 500 });
  }
}

async function load({ supabase, session }: Ctx): Promise<TeamData> {
  const ws = session.workspace.id;
  const [w, m, d, i, t, s] = await Promise.all([
    supabase.from("workspaces").select("name, company_size, onboarded_at").eq("id", ws).single(),
    supabase.from("workspace_members").select("user_id, email, role, department_id, job_title, created_at").eq("workspace_id", ws).order("created_at"),
    supabase.from("departments").select("id, name").eq("workspace_id", ws).order("name"),
    supabase.from("workspace_invites").select("id, email, role, department_id, created_at").eq("workspace_id", ws).order("created_at"),
    supabase
      .from("tools")
      .select("id, name, category, description, department_id, contract_id, annual_cost, seats, renewal_date, source, confirmed, created_at")
      .eq("workspace_id", ws)
      .order("name"),
    supabase
      .from("tool_surveys")
      .select("id, tool_id, respondent_email, purpose, criticality, replacement, no_replacement_needed, seats_needed, seats_needed_count, created_at")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false }),
  ]);
  const err = [w, m, d, i, t, s].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const members = (m.data ?? []) as TeamData["members"];
  const me = members.find((x) => x.user_id === session.userId);
  return {
    workspace: w.data as TeamData["workspace"],
    me: {
      user_id: session.userId,
      email: session.email,
      role: session.role,
      department_id: me?.department_id ?? null,
      job_title: me?.job_title ?? null,
    },
    departments: (d.data ?? []) as TeamData["departments"],
    members,
    invites: (i.data ?? []) as TeamData["invites"],
    tools: ((t.data ?? []) as TeamData["tools"]).map((x) => ({ ...x, annual_cost: x.annual_cost == null ? null : Number(x.annual_cost) })),
    surveys: (s.data ?? []) as TeamData["surveys"],
  };
}

/** Every uploaded contract becomes a suggested tool, in the uploader's department when we know it. */
async function syncUploads({ supabase, session }: Ctx) {
  const ws = session.workspace.id;
  const [c, t, m] = await Promise.all([
    supabase.from("contracts").select("id, vendor, agreement_name, annual_fee, seats, term_end, uploaded_by").eq("workspace_id", ws),
    supabase.from("tools").select("contract_id").eq("workspace_id", ws).not("contract_id", "is", null),
    supabase.from("workspace_members").select("user_id, department_id").eq("workspace_id", ws),
  ]);
  if (t.error) throw new Error(t.error.message);
  const have = new Set((t.data ?? []).map((x) => x.contract_id));
  const deptOf = new Map((m.data ?? []).map((x) => [x.user_id, x.department_id as string | null]));
  const myDept = deptOf.get(session.userId) ?? null;
  const rows = (c.data ?? [])
    .filter((x) => !have.has(x.id))
    .map((x) => {
      const dept = deptOf.get(x.uploaded_by) ?? null;
      // Department owners can only file tools under their own department (RLS); otherwise leave it unassigned.
      const department_id = session.role === "owner" || dept === myDept ? dept : null;
      return {
        workspace_id: ws,
        contract_id: x.id,
        name: String(x.vendor).slice(0, 120),
        category: guessCategory(`${x.vendor} ${x.agreement_name ?? ""}`),
        annual_cost: x.annual_fee,
        seats: x.seats,
        renewal_date: x.term_end,
        source: "upload",
        confirmed: false,
        department_id,
      };
    });
  if (rows.length) {
    const { error } = await supabase.from("tools").upsert(rows, { onConflict: "contract_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
}

function cleanTool(input: ToolInput, partial: boolean): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined || !partial) {
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
    if (!name) return "Give the tool a name.";
    out.name = name;
  }
  if (input.category !== undefined) out.category = String(input.category).slice(0, 60) || "Other";
  else if (!partial) out.category = guessCategory(String(out.name));
  if (input.description !== undefined) out.description = input.description ? String(input.description).slice(0, 1000) : null;
  if (input.department_id !== undefined) out.department_id = input.department_id || null;
  if (input.annual_cost !== undefined) {
    const n = input.annual_cost == null || (input.annual_cost as unknown) === "" ? null : Number(input.annual_cost);
    if (n != null && (!Number.isFinite(n) || n < 0)) return "Annual cost must be a positive number.";
    out.annual_cost = n;
  }
  if (input.seats !== undefined) {
    const n = input.seats == null || (input.seats as unknown) === "" ? null : Math.round(Number(input.seats));
    if (n != null && (!Number.isFinite(n) || n < 0)) return "Seats must be a positive number.";
    out.seats = n;
  }
  if (input.renewal_date !== undefined) out.renewal_date = isDate(input.renewal_date) ? input.renewal_date : null;
  if (input.confirmed !== undefined) out.confirmed = Boolean(input.confirmed);
  return out;
}

export async function POST(req: Request) {
  const ctx = await requireSession();
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => null)) as TeamOp | null;
  if (!body || typeof body.op !== "string") return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  try {
    const result = await run(ctx, body, new URL(req.url).origin);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: missingTables((e as Error).message) }, { status: 500 });
  }
}

async function run(ctx: Ctx, body: TeamOp, origin: string): Promise<OpResult> {
  const { supabase, session } = ctx;
  const ws = session.workspace.id;
  const isAdmin = session.role === "owner";
  const adminOnly = (): OpResult | null => (isAdmin ? null : { ok: false, error: "Only admins can do that." });
  const fail = (error: { message: string } | null): OpResult => (error ? { ok: false, error: missingTables(error.message) } : { ok: true });

  switch (body.op) {
    case "setup": {
      const denied = adminOnly();
      if (denied) return denied;
      const patch: Record<string, unknown> = {};
      if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
      if (body.company_size !== undefined) patch.company_size = body.company_size ? String(body.company_size).slice(0, 20) : null;
      if (body.onboarded) patch.onboarded_at = new Date().toISOString();
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("workspaces").update(patch).eq("id", ws);
        if (error) return fail(error);
      }
      if (body.job_title !== undefined) {
        const { error } = await supabase
          .from("workspace_members")
          .update({ job_title: body.job_title ? String(body.job_title).slice(0, 80) : null })
          .eq("workspace_id", ws)
          .eq("user_id", session.userId);
        if (error) return fail(error);
      }
      return { ok: true };
    }
    case "addDepartments": {
      const denied = adminOnly();
      if (denied) return denied;
      const names = Array.from(new Set((body.names ?? []).map((n) => String(n).trim().slice(0, 60)).filter(Boolean)));
      if (!names.length) return { ok: false, error: "Add at least one department." };
      const { data: existing } = await supabase.from("departments").select("name").eq("workspace_id", ws);
      const have = new Set((existing ?? []).map((d) => d.name.toLowerCase()));
      const rows = names.filter((n) => !have.has(n.toLowerCase())).map((name) => ({ workspace_id: ws, name }));
      if (!rows.length) return { ok: true };
      return fail((await supabase.from("departments").insert(rows)).error);
    }
    case "renameDepartment": {
      const denied = adminOnly();
      if (denied) return denied;
      const name = String(body.name ?? "").trim().slice(0, 60);
      if (!name) return { ok: false, error: "Give the department a name." };
      return fail((await supabase.from("departments").update({ name }).eq("id", body.id).eq("workspace_id", ws)).error);
    }
    case "deleteDepartment": {
      const denied = adminOnly();
      if (denied) return denied;
      return fail((await supabase.from("departments").delete().eq("id", body.id).eq("workspace_id", ws)).error);
    }
    case "updateMember": {
      const denied = adminOnly();
      if (denied) return denied;
      const patch: Record<string, unknown> = {};
      if (body.department_id !== undefined) patch.department_id = body.department_id || null;
      if (body.role === "owner" || body.role === "member") {
        if (body.user_id === session.userId && body.role !== "owner") return { ok: false, error: "You can't remove your own admin access." };
        patch.role = body.role;
      }
      if (!Object.keys(patch).length) return { ok: false, error: "Nothing to update." };
      return fail((await supabase.from("workspace_members").update(patch).eq("workspace_id", ws).eq("user_id", body.user_id)).error);
    }
    case "invite": {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!EMAIL.test(email)) return { ok: false, error: "Enter a valid email address." };
      const role = body.role === "owner" ? "owner" : "member";
      if (role === "owner" && !isAdmin) return { ok: false, error: "Only admins can invite another admin." };
      const department_id = body.department_id || null;

      const { data: member } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("email", email).maybeSingle();
      if (member) {
        if (!isAdmin) return { ok: false, error: `${email} is already in this workspace.` };
        const patch: Record<string, unknown> = {};
        if (department_id) patch.department_id = department_id;
        if (role === "owner") patch.role = "owner";
        if (Object.keys(patch).length) {
          const { error } = await supabase.from("workspace_members").update(patch).eq("workspace_id", ws).eq("user_id", member.user_id);
          if (error) return fail(error);
        }
        return { ok: true, emailed: false, emailNote: `${email} is already a member, so no email was sent. Their department and role are updated.` };
      }

      await supabase.from("workspace_invites").delete().eq("workspace_id", ws).eq("email", email);
      const { error } = await supabase.from("workspace_invites").insert({ workspace_id: ws, email, role, department_id });
      if (error) return fail(error);
      const dept = department_id
        ? (await supabase.from("departments").select("name").eq("id", department_id).maybeSingle()).data?.name ?? null
        : null;
      const sent = await sendInviteEmail(email, origin, {
        workspace: session.workspace.name,
        inviter: session.email || null,
        department: dept,
        role,
      });
      return { ok: true, emailed: sent.emailed, emailNote: sent.note };
    }
    case "cancelInvite":
      return fail((await supabase.from("workspace_invites").delete().eq("id", body.id).eq("workspace_id", ws)).error);
    case "resendInvite": {
      // Invite links expire, so people need a fresh one. Department owners can resend invites to their own department.
      const { data: inv, error } = await supabase
        .from("workspace_invites")
        .select("email, role, department_id")
        .eq("id", body.id)
        .eq("workspace_id", ws)
        .maybeSingle();
      if (error) return fail(error);
      if (!inv) return { ok: false, error: "That invite was cancelled or already accepted." };
      if (!isAdmin && inv.department_id !== (await myDepartment(ctx))) return { ok: false, error: "Only admins can resend this invite." };
      const dept = inv.department_id
        ? (await supabase.from("departments").select("name").eq("id", inv.department_id).maybeSingle()).data?.name ?? null
        : null;
      const sent = await sendInviteEmail(inv.email, origin, {
        workspace: session.workspace.name,
        inviter: session.email || null,
        department: dept,
        role: inv.role === "owner" ? "owner" : "member",
      });
      return { ok: true, emailed: sent.emailed, emailNote: sent.note };
    }
    case "addTool": {
      const clean = cleanTool(body.tool ?? {}, false);
      if (typeof clean === "string") return { ok: false, error: clean };
      if (!isAdmin && clean.department_id === undefined) clean.department_id = await myDepartment(ctx);
      const { data, error } = await supabase
        .from("tools")
        .insert({ ...clean, workspace_id: ws, source: "manual", confirmed: true })
        .select("id")
        .single();
      if (error) return fail(error);
      return { ok: true, id: data.id };
    }
    case "updateTool": {
      const clean = cleanTool(body.tool ?? {}, true);
      if (typeof clean === "string") return { ok: false, error: clean };
      const { data, error } = await supabase
        .from("tools")
        .update({ ...clean, updated_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("workspace_id", ws)
        .select("id");
      if (error) return fail(error);
      if (!data?.length) return { ok: false, error: "You can only edit tools that belong to your department." };
      return { ok: true };
    }
    case "deleteTool": {
      const { data, error } = await supabase.from("tools").delete().eq("id", body.id).eq("workspace_id", ws).select("id");
      if (error) return fail(error);
      if (!data?.length) return { ok: false, error: "Only admins, or whoever added it, can remove a tool." };
      return { ok: true };
    }
    case "answerSurvey": {
      const a = body.answers;
      const purpose = String(a?.purpose ?? "").trim().slice(0, 1000);
      const criticality = Math.round(Number(a?.criticality));
      if (!purpose) return { ok: false, error: "Say what the team uses it for." };
      if (!(criticality >= 1 && criticality <= 5)) return { ok: false, error: "Pick how critical it is, from 1 to 5." };
      const seats_needed = a.seats_needed === "some" || a.seats_needed === "unsure" ? a.seats_needed : "all";
      const count = seats_needed === "some" && a.seats_needed_count != null ? Math.max(0, Math.round(Number(a.seats_needed_count))) : null;
      const { error } = await supabase.from("tool_surveys").insert({
        workspace_id: ws,
        tool_id: body.tool_id,
        respondent_id: session.userId,
        respondent_email: session.email,
        purpose,
        criticality,
        replacement: a.no_replacement_needed ? null : String(a.replacement ?? "").trim().slice(0, 300) || null,
        no_replacement_needed: Boolean(a.no_replacement_needed),
        seats_needed,
        seats_needed_count: Number.isFinite(count) ? count : null,
      });
      if (error) {
        if (/row-level security/i.test(error.message)) return { ok: false, error: "You can only answer for your own department's tools." };
        return fail(error);
      }
      // Answering confirms the tool belongs to the team.
      await supabase.from("tools").update({ confirmed: true }).eq("id", body.tool_id).eq("workspace_id", ws);
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown operation." };
  }
}

async function myDepartment({ supabase, session }: Ctx): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("department_id")
    .eq("workspace_id", session.workspace.id)
    .eq("user_id", session.userId)
    .single();
  return (data?.department_id as string | null) ?? null;
}
