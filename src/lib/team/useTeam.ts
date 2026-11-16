"use client";

// One hook for the team data: Supabase (via /api/team) when signed in, the browser in demo mode.
// When sample data is on, the Northwind sample team is merged in (read-only).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useSavedContracts } from "@/lib/portfolio";
import { useStored } from "@/lib/store";
import { buildInsights } from "./insights";
import { SAMPLE_DEPARTMENTS, SAMPLE_SURVEYS, SAMPLE_TOOLS } from "./sample";
import { guessCategory, type OpResult, type TeamData, type TeamOp } from "./types";

const DEMO_KEY = "cr-team-demo";
const DEMO_ME = { user_id: "demo-user", email: "you (demo)", role: "owner" as const, department_id: null, job_title: null };

const emptyDemo = (): TeamData => ({
  workspace: { name: "Demo workspace", company_size: null, onboarded_at: null },
  me: DEMO_ME,
  departments: [],
  members: [{ ...DEMO_ME, created_at: new Date(0).toISOString() }],
  invites: [],
  tools: [],
  surveys: [],
});

let cloudCache: TeamData | null = null;
const listeners = new Set<(v: TeamData) => void>();
const publish = (v: TeamData) => {
  cloudCache = v;
  listeners.forEach((l) => l(v));
};

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`);

/** Applies an operation to the demo copy kept in localStorage. Mirrors the API's rules loosely. */
function applyDemo(d: TeamData, op: TeamOp): [TeamData, OpResult] {
  const now = new Date().toISOString();
  const next = structuredClone(d);
  switch (op.op) {
    case "setup":
      if (op.name) next.workspace.name = op.name;
      if (op.company_size !== undefined) next.workspace.company_size = op.company_size;
      if (op.onboarded) next.workspace.onboarded_at = now;
      if (op.job_title !== undefined) next.me.job_title = op.job_title;
      break;
    case "addDepartments":
      for (const n of op.names.map((x) => x.trim()).filter(Boolean)) {
        if (!next.departments.some((x) => x.name.toLowerCase() === n.toLowerCase())) next.departments.push({ id: uid(), name: n });
      }
      next.departments.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "renameDepartment":
      next.departments = next.departments.map((x) => (x.id === op.id ? { ...x, name: op.name.trim() } : x));
      break;
    case "deleteDepartment":
      next.departments = next.departments.filter((x) => x.id !== op.id);
      next.tools = next.tools.map((t) => (t.department_id === op.id ? { ...t, department_id: null } : t));
      next.invites = next.invites.map((i) => (i.department_id === op.id ? { ...i, department_id: null } : i));
      break;
    case "updateMember":
      next.members = next.members.map((m) =>
        m.user_id === op.user_id ? { ...m, ...(op.department_id !== undefined && { department_id: op.department_id }), ...(op.role && { role: op.role }) } : m,
      );
      break;
    case "invite": {
      const email = op.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return [d, { ok: false, error: "Enter a valid email address." }];
      next.invites = next.invites.filter((i) => i.email !== email);
      next.invites.push({ id: uid(), email, role: op.role, department_id: op.department_id, created_at: now });
      return [next, { ok: true, emailed: false, emailNote: "Demo mode: no email is sent. With Supabase connected, they get an invite link by email." }];
    }
    case "cancelInvite":
      next.invites = next.invites.filter((i) => i.id !== op.id);
      break;
    case "resendInvite":
      return [d, { ok: true, emailed: false, emailNote: "Demo mode: no email is sent." }];
    case "addTool": {
      if (!op.tool.name?.trim()) return [d, { ok: false, error: "Give the tool a name." }];
      const id = uid();
      next.tools.push({
        id,
        name: op.tool.name.trim(),
        category: op.tool.category || guessCategory(op.tool.name),
        description: op.tool.description ?? null,
        department_id: op.tool.department_id ?? null,
        contract_id: null,
        annual_cost: op.tool.annual_cost ?? null,
        seats: op.tool.seats ?? null,
        renewal_date: op.tool.renewal_date ?? null,
        source: "manual",
        confirmed: true,
        created_at: now,
      });
      return [next, { ok: true, id }];
    }
    case "importTools":
      for (const t of op.tools) {
        next.tools.push({
          id: t.id,
          name: t.name,
          category: t.category || guessCategory(t.name),
          description: t.description ?? null,
          department_id: t.department_id ?? null,
          contract_id: null,
          annual_cost: t.annual_cost ?? null,
          seats: t.seats ?? null,
          renewal_date: null,
          source: "import",
          confirmed: false,
          created_at: now,
        });
      }
      break;
    case "updateTool":
      next.tools = next.tools.map((t) => (t.id === op.id ? { ...t, ...op.tool } : t));
      break;
    case "deleteTool":
      next.tools = next.tools.filter((t) => t.id !== op.id);
      next.surveys = next.surveys.filter((s) => s.tool_id !== op.id);
      break;
    case "answerSurvey": {
      const a = op.answers;
      if (!a.purpose.trim()) return [d, { ok: false, error: "Say what the team uses it for." }];
      if (!(a.criticality >= 1 && a.criticality <= 5)) return [d, { ok: false, error: "Pick how critical it is, from 1 to 5." }];
      next.surveys.unshift({ id: uid(), tool_id: op.tool_id, respondent_email: d.me.email, ...a, created_at: now });
      next.tools = next.tools.map((t) => (t.id === op.tool_id ? { ...t, confirmed: true } : t));
      break;
    }
  }
  return [next, { ok: true }];
}

export function useTeam() {
  const ws = useWorkspace();
  const { saved } = useSavedContracts();
  const [demo, setDemo] = useStored<TeamData | null>(DEMO_KEY, null);
  const [cloud, setCloud] = useState<TeamData | null>(cloudCache);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (ws.mode !== "cloud") return;
    try {
      const res = await fetch("/api/team", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load your team.");
      publish(json as TeamData);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [ws.mode]);

  useEffect(() => {
    if (ws.mode !== "cloud") return;
    listeners.add(setCloud);
    refresh();
    return () => {
      listeners.delete(setCloud);
    };
  }, [ws.mode, refresh]);

  // Demo mode: uploaded contracts (kept in this browser) show up as suggested tools.
  const demoData = useMemo(() => {
    const base = demo ?? emptyDemo();
    const have = new Set(base.tools.map((t) => t.contract_id).filter(Boolean));
    const extra = saved
      .filter((s) => !have.has(s.id))
      .map((s) => ({
        id: `upl-${s.id}`,
        name: s.data.vendor,
        category: guessCategory(`${s.data.vendor} ${s.data.agreement_name ?? ""}`),
        description: null,
        department_id: null,
        contract_id: s.id,
        annual_cost: s.data.annual_fee.value,
        seats: s.data.seats.value,
        renewal_date: s.data.term_end.value,
        source: "upload" as const,
        confirmed: false,
        created_at: s.extractedAt,
      }));
    return { ...base, tools: [...base.tools, ...extra] };
  }, [demo, saved]);

  const raw: TeamData | null = ws.mode === "cloud" ? cloud : demoData;

  const run = useCallback(
    async (op: TeamOp): Promise<OpResult> => {
      if (ws.mode === "cloud") {
        try {
          const res = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) });
          const json = (await res.json().catch(() => ({}))) as OpResult;
          if (!res.ok || !json.ok) return { ok: false, error: json.error ?? "Something went wrong." };
          await refresh();
          return json;
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      }
      // Demo: materialise suggested upload tools before editing them.
      const base = structuredClone(demoData);
      const [next, result] = applyDemo(base, op);
      if (result.ok) setDemo(next);
      return result;
    },
    [ws.mode, refresh, demoData, setDemo],
  );

  const data = useMemo<TeamData | null>(() => {
    if (!raw) return null;
    // The sample team is a preview: once the workspace has tools of its own, show only those.
    if (!ws.showSample || raw.tools.length > 0) return raw;
    return {
      ...raw,
      departments: [...raw.departments, ...SAMPLE_DEPARTMENTS],
      tools: [...raw.tools, ...SAMPLE_TOOLS],
      surveys: [...raw.surveys, ...SAMPLE_SURVEYS],
    };
  }, [raw, ws.showSample]);

  const insights = useMemo(() => (data ? buildInsights(data.tools, data.surveys, data.departments) : null), [data]);

  const me = raw?.me ?? null;
  const isAdmin = me?.role === "owner";
  /** Can this person edit the tool / answer its survey? Mirrors the RLS rules. */
  const canEdit = useCallback(
    (t: { department_id: string | null; sample?: boolean }) =>
      !t.sample && Boolean(me) && (isAdmin || t.department_id == null || t.department_id === me?.department_id),
    [me, isAdmin],
  );

  return {
    data,
    raw,
    insights,
    me,
    isAdmin,
    canEdit,
    loading: ws.mode === "cloud" && !cloud && !error,
    error,
    run,
    refresh,
    mode: ws.mode,
    showSample: ws.showSample,
    /** True while the Northwind sample team is standing in for an empty workspace. */
    showingSample: Boolean(raw && ws.showSample && raw.tools.length === 0),
  };
}
