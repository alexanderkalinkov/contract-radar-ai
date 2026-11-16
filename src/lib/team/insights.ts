// Turns the tool list and survey answers into what leadership needs: overlaps across
// departments, low-value tools and a recommendation for each tool.
import { daysUntil, TODAY } from "@/lib/engine";
import type { Department, Survey, Tool } from "./types";

export type Action = "keep" | "cut_seats" | "consolidate" | "renegotiate" | "cancel" | "needs_survey";

export const ACTION_LABEL: Record<Action, string> = {
  keep: "Keep",
  cut_seats: "Cut seats",
  consolidate: "Consolidate",
  renegotiate: "Renegotiate",
  cancel: "Cancel",
  needs_survey: "Waiting for survey",
};

export const ACTION_CLASS: Record<Action, string> = {
  keep: "bg-good-soft text-good-dark",
  cut_seats: "bg-brand-soft text-brand-dark",
  consolidate: "bg-[#F4EBFF] text-[#53389E]",
  renegotiate: "bg-warn-soft text-warn-text",
  cancel: "bg-[#FEE4E2] text-[#912018]",
  needs_survey: "bg-chip text-ink-2",
};

export interface Recommendation {
  action: Action;
  reason: string;
  savings: number;
  into?: string; // tool to consolidate into
}

export interface Overlap {
  category: string;
  tools: Tool[];
  departments: string[];
  standard: Tool;
  totalCost: number;
  savings: number;
  summary: string;
}

export interface ToolInsight {
  tool: Tool;
  survey: Survey | null;
  department: string;
  recommendation: Recommendation;
  lowValue: boolean;
  surveyDue: boolean;
}

export interface Insights {
  rows: ToolInsight[];
  overlaps: Overlap[];
  lowValue: ToolInsight[];
  surveyDue: ToolInsight[];
  totals: { spend: number; tools: number; answered: number; savings: number };
  byDepartment: { id: string | null; name: string; spend: number; tools: number; answered: number; savings: number }[];
}

/** Does a free-text answer mention this tool? Matches on the first word of its name. */
export function mentions(text: string, toolName: string): boolean {
  const first = toolName.toLowerCase().split(/[\s.]/)[0];
  return first.length >= 3 && text.toLowerCase().includes(first);
}

export const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|software|suite|teams|cloud|hub|business|enterprise|pro|plus)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

/** The latest answer per tool. */
export function latestSurveys(surveys: Survey[]): Map<string, Survey> {
  const map = new Map<string, Survey>();
  for (const s of surveys) {
    const cur = map.get(s.tool_id);
    if (!cur || s.created_at > cur.created_at) map.set(s.tool_id, s);
  }
  return map;
}

const LOW_VALUE_MIN_COST = 5_000;
const RENEGOTIATE_WINDOW_DAYS = 120;
const SURVEY_DUE_DAYS = 45; // re-ask a month or so before renewal
const SURVEY_STALE_DAYS = 180;

function perSeat(t: Tool) {
  return t.annual_cost && t.seats ? t.annual_cost / t.seats : null;
}

export function buildInsights(tools: Tool[], surveys: Survey[], departments: Department[], today?: string): Insights {
  const latest = latestSurveys(surveys);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const nameOf = (t: Tool) => (t.department_id ? deptName.get(t.department_id) ?? "Unassigned" : "Unassigned");
  const active = tools.filter((t) => t.confirmed || t.department_id);

  // How "standard" a tool is: departments using the same product, seats, how critical people say it is.
  const usage = new Map<string, Set<string>>();
  for (const t of active) {
    const k = normName(t.name);
    if (!usage.has(k)) usage.set(k, new Set());
    usage.get(k)!.add(t.department_id ?? "none");
  }
  const score = (t: Tool) =>
    (usage.get(normName(t.name))?.size ?? 1) * 1000 + (t.seats ?? 0) + (latest.get(t.id)?.criticality ?? 3) * 10;

  // Overlaps: one category, two or more departments, paying for different tools or separate copies of one tool.
  const overlaps: Overlap[] = [];
  const byCat = new Map<string, Tool[]>();
  for (const t of active) {
    if (t.category === "Other") continue;
    if (!byCat.has(t.category)) byCat.set(t.category, []);
    byCat.get(t.category)!.push(t);
  }
  const consolidateInto = new Map<string, { into: Tool; savings: number; reason: string }>();
  for (const [category, list] of byCat) {
    const depts = new Set(list.map((t) => t.department_id ?? "none"));
    if (list.length < 2 || depts.size < 2) continue;
    // Tools that are only "near" each other (e.g. CRM vs call recording) are both critical: skip if every tool is a 5.
    const standard = list.slice().sort((a, b) => score(b) - score(a))[0];
    const others = list.filter((t) => t.id !== standard.id);
    let savings = 0;
    for (const o of others) {
      const s = latest.get(o.id);
      // If the team named a fallback that's in this group, move them there; otherwise to the standard.
      const named = s?.replacement ? list.find((x) => x.id !== o.id && mentions(s.replacement!, x.name)) : undefined;
      const target = named ?? standard;
      const sameProduct = normName(o.name) === normName(target.name);
      // A tool its own team rates 4-5 isn't swapped for a different product without a conversation.
      if (!sameProduct && !named && s && s.criticality >= 4) continue;
      const tSeat = perSeat(target);
      const seatsMoving = s?.seats_needed === "some" && s.seats_needed_count != null ? s.seats_needed_count : o.seats ?? 0;
      const cost = o.annual_cost ?? 0;
      const est = sameProduct
        ? Math.round(cost * 0.15) // one contract instead of two: volume tier and less admin
        : Math.max(0, Math.round(cost - (tSeat ? tSeat * seatsMoving : cost * 0.5)));
      if (!sameProduct && est <= 0) continue; // moving them over would cost as much as it saves
      savings += est;
      consolidateInto.set(o.id, {
        into: target,
        savings: est,
        reason: sameProduct
          ? `${nameOf(target)} and ${nameOf(o)} buy ${target.name} separately. Merge into one contract for a better tier.`
          : named
            ? `${nameOf(o)} says they'd use ${target.name}, which ${nameOf(target)} already pays for.`
            : `${nameOf(o)} could move to ${target.name}, which ${usage.get(normName(target.name))!.size > 1 ? "several teams already use" : `${nameOf(target)} already uses`}.`,
      });
    }
    if (!others.some((o) => consolidateInto.has(o.id))) continue;
    const names = Array.from(new Set(list.map((t) => t.name)));
    const deptNames = Array.from(new Set(list.map(nameOf)));
    overlaps.push({
      category,
      tools: list,
      departments: deptNames,
      standard,
      totalCost: list.reduce((s, t) => s + (t.annual_cost ?? 0), 0),
      savings,
      summary:
        names.length === 1
          ? `${deptNames.length} teams pay for ${names[0]} on separate contracts.`
          : `${deptNames.length} teams pay for ${names.length} different tools for ${category}. ${standard.name} is the most used.`,
    });
  }
  overlaps.sort((a, b) => b.savings - a.savings);

  const rows: ToolInsight[] = active.map((t) => {
    const s = latest.get(t.id) ?? null;
    const cost = t.annual_cost ?? 0;
    const lowValue = Boolean(s && s.criticality <= 2 && cost >= LOW_VALUE_MIN_COST);
    const days = t.renewal_date ? daysUntil(t.renewal_date, today) : null;
    const surveyAgeDays = s ? Math.round((Date.parse(today ?? TODAY) - Date.parse(s.created_at)) / 86_400_000) : null;
    const surveyDue = days != null && days >= 0 && days <= SURVEY_DUE_DAYS && (!s || (surveyAgeDays ?? 0) > SURVEY_STALE_DAYS);

    let rec: Recommendation;
    const cons = consolidateInto.get(t.id);
    const replacementTool =
      s?.replacement &&
      active.find((o) => o.id !== t.id && mentions(s.replacement!, o.name));
    if (!s) {
      rec = { action: "needs_survey", reason: `Ask ${nameOf(t) === "Unassigned" ? "the owning team" : nameOf(t)} to answer the 4 questions.`, savings: 0 };
    } else if (s.criticality <= 2 && s.no_replacement_needed) {
      rec = { action: "cancel", reason: `Rated ${s.criticality}/5 and the team says they wouldn't need a replacement.`, savings: cost };
    } else if (cons) {
      rec = { action: "consolidate", reason: cons.reason, savings: cons.savings, into: cons.into.name };
    } else if (s.criticality <= 2 && replacementTool) {
      const est = Math.round(cost * 0.7);
      rec = { action: "consolidate", reason: `Rated ${s.criticality}/5, and the team would use ${replacementTool.name}, which you already pay for.`, savings: est, into: replacementTool.name };
    } else if (s.seats_needed === "some" && s.seats_needed_count != null && t.seats && s.seats_needed_count < t.seats) {
      const cut = t.seats - s.seats_needed_count;
      rec = { action: "cut_seats", reason: `The team needs ${s.seats_needed_count} of ${t.seats} seats. Drop ${cut} at renewal.`, savings: Math.round((perSeat(t) ?? 0) * cut) };
    } else if (s.criticality <= 2 && cost >= LOW_VALUE_MIN_COST) {
      rec = { action: "renegotiate", reason: `Low criticality (${s.criticality}/5) for the price. Ask for a smaller plan or cancel.`, savings: Math.round(cost * 0.25) };
    } else if (days != null && days >= 0 && days <= RENEGOTIATE_WINDOW_DAYS && cost >= 10_000) {
      rec = { action: "renegotiate", reason: `Renews in ${days} days. A must-keep tool is the best time to ask for a multi-year discount.`, savings: Math.round(cost * 0.08) };
    } else {
      rec = { action: "keep", reason: `Rated ${s.criticality}/5 and all seats are in use.`, savings: 0 };
    }
    return { tool: t, survey: s, department: nameOf(t), recommendation: rec, lowValue, surveyDue };
  });

  const order: Action[] = ["cancel", "consolidate", "cut_seats", "renegotiate", "needs_survey", "keep"];
  rows.sort((a, b) => order.indexOf(a.recommendation.action) - order.indexOf(b.recommendation.action) || b.recommendation.savings - a.recommendation.savings);

  const deptIds: (string | null)[] = [...departments.map((d) => d.id), null];
  const byDepartment = deptIds
    .map((id) => {
      const list = rows.filter((r) => (r.tool.department_id ?? null) === id);
      return {
        id,
        name: id ? deptName.get(id) ?? "Unknown" : "Unassigned",
        spend: list.reduce((s, r) => s + (r.tool.annual_cost ?? 0), 0),
        tools: list.length,
        answered: list.filter((r) => r.survey).length,
        savings: list.reduce((s, r) => s + r.recommendation.savings, 0),
      };
    })
    .filter((d) => d.id !== null || d.tools > 0)
    .sort((a, b) => b.spend - a.spend);

  return {
    rows,
    overlaps,
    lowValue: rows.filter((r) => r.lowValue).sort((a, b) => (b.tool.annual_cost ?? 0) - (a.tool.annual_cost ?? 0)),
    surveyDue: rows.filter((r) => r.surveyDue),
    totals: {
      spend: rows.reduce((s, r) => s + (r.tool.annual_cost ?? 0), 0),
      tools: rows.length,
      answered: rows.filter((r) => r.survey).length,
      savings: rows.reduce((s, r) => s + r.recommendation.savings, 0),
    },
    byDepartment,
  };
}
