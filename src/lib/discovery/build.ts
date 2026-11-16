// Pure functions shared by the server (sync) and the browser (review screen, demo mode).
import { isCompanyWide, matchDepartment, matchVendor, NON_SOFTWARE_HINT, SOFTWARE_HINT, type Match } from "./catalog";
import type { DiscoveredItem, DiscoveryData, Signal } from "./types";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shortDay = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** One payment line from accounting: a bill, a card or bank expense. */
export interface SpendLine {
  vendor: string;
  amount: number;
  date: string; // YYYY-MM-DD
  hint: string; // expense account name and line descriptions
  currency: string | null;
}

export interface SpendCandidate {
  match: Match;
  rawNames: string[];
  total12m: number;
  count: number;
  last: string;
  cadence: Signal["cadence"];
  currency: string | null;
  hinted: boolean;
  /** Account or description says rent, travel, payroll… */
  notSoftware: boolean;
}

function cadenceOf(dates: string[]): Signal["cadence"] {
  if (dates.length < 2) return dates.length === 1 ? "annual" : null;
  const t = [...dates].sort().map((d) => Date.parse(d));
  const gaps = t.slice(1).map((x, i) => (x - t[i]) / DAY).filter((g) => g > 3).sort((a, b) => a - b);
  if (!gaps.length) return "irregular";
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median <= 45) return "monthly";
  if (median <= 110) return "quarterly";
  if (median >= 300) return "annual";
  return "irregular";
}

/**
 * Groups payment lines by vendor and keeps the ones that look like a software subscription:
 * a known SaaS vendor, a software expense account / description, or at least 3 monthly payments.
 * `unknownOk` decides the rest (Claude's answer when a key is set).
 */
export function aggregateSpend(lines: SpendLine[], today = new Date()): SpendCandidate[] {
  const since = iso(new Date(today.getTime() - 365 * DAY));
  const groups = new Map<string, { match: Match; lines: SpendLine[]; names: Set<string> }>();
  for (const l of lines) {
    if (!l.vendor?.trim() || !(l.amount > 0)) continue;
    const m = matchVendor(l.vendor);
    const g = groups.get(m.key) ?? { match: m, lines: [], names: new Set<string>() };
    g.lines.push(l);
    g.names.add(l.vendor.trim());
    groups.set(m.key, g);
  }
  const out: SpendCandidate[] = [];
  for (const g of groups.values()) {
    const recent = g.lines.filter((l) => l.date >= since);
    if (!recent.length) continue;
    const dates = recent.map((l) => l.date);
    const cadence = cadenceOf(dates);
    const notSoftware = !g.match.known && g.lines.some((l) => NON_SOFTWARE_HINT.test(`${l.vendor} ${l.hint}`));
    const hinted = !notSoftware && g.lines.some((l) => SOFTWARE_HINT.test(l.hint));
    const candidate: SpendCandidate = {
      match: g.match,
      rawNames: [...g.names].slice(0, 5),
      total12m: Math.round(recent.reduce((s, l) => s + l.amount, 0) * 100) / 100,
      count: recent.length,
      last: dates.sort().at(-1)!,
      cadence,
      currency: recent[0].currency,
      hinted,
      notSoftware,
    };
    out.push(candidate);
  }
  return out.sort((a, b) => b.total12m - a.total12m);
}

/** Should this vendor be kept without asking Claude? */
export const obviousSoftware = (c: SpendCandidate) => c.match.known || c.hinted;
/** Worth asking Claude about (or keeping when no key): recurring but unknown. */
export const maybeSoftware = (c: SpendCandidate) => !obviousSoftware(c) && !c.notSoftware && c.count >= 3 && (c.cadence === "monthly" || c.cadence === "quarterly");

export function spendSignal(provider: Signal["provider"], c: SpendCandidate, override?: { name?: string; category?: string; dept?: string | null }): Signal {
  return {
    provider,
    vendor_key: c.match.key,
    name: override?.name || c.match.name,
    category: override?.category || c.match.category,
    dept_hint: override?.dept !== undefined ? override.dept : c.match.dept,
    kind: "spend",
    annual_spend: c.total12m,
    payment_count: c.count,
    last_seen: c.last,
    cadence: c.cadence,
    currency: c.currency,
    users: null,
    licensed: null,
    dept_counts: null,
    evidence: `${c.count} payment${c.count === 1 ? "" : "s"} in 12 months, last on ${shortDay(c.last)}${c.cadence && c.cadence !== "irregular" ? ` (${c.cadence})` : ""}`,
  };
}

/** One app seen in sign-in data. */
export interface UsageApp {
  name: string;
  users: Set<string>; // lower-case emails
  /** Head count when we only know the number, not who (e.g. assigned Microsoft licences). */
  count?: number;
  licensed?: number | null;
  note?: string;
}

export function usageSignal(
  provider: Signal["provider"],
  app: UsageApp,
  deptOf: Map<string, string>,
  windowDays: number,
  override?: { name?: string; category?: string; dept?: string | null },
): Signal {
  const m = matchVendor(app.name);
  const counts: Record<string, number> = {};
  for (const u of app.users) {
    const d = deptOf.get(u);
    if (d) counts[d] = (counts[d] ?? 0) + 1;
  }
  const n = app.count ?? app.users.size;
  return {
    provider,
    vendor_key: m.key,
    name: override?.name || m.name,
    category: override?.category || m.category,
    dept_hint: override?.dept !== undefined ? override.dept : m.dept,
    kind: "usage",
    annual_spend: null,
    payment_count: null,
    last_seen: null,
    cadence: null,
    currency: null,
    users: n,
    licensed: app.licensed ?? null,
    dept_counts: Object.keys(counts).length ? counts : null,
    evidence: app.note ?? `${n} ${n === 1 ? "person" : "people"} signed in, last ${windowDays} days`,
  };
}

/** Merge every provider's signals per vendor, suggest a department and attach the admin's review state. */
export function buildItems(
  data: Pick<DiscoveryData, "signals" | "states">,
  departments: { id: string; name: string; sample?: boolean }[],
  tools: { id: string; name: string; sample?: boolean }[],
): DiscoveredItem[] {
  const depts = departments.filter((d) => !d.sample);
  const toolByKey = new Map<string, string>();
  for (const t of tools) if (!t.sample) toolByKey.set(matchVendor(t.name).key, t.id);
  const states = new Map(data.states.map((s) => [s.vendor_key, s]));
  const byKey = new Map<string, Signal[]>();
  for (const s of data.signals) byKey.set(s.vendor_key, [...(byKey.get(s.vendor_key) ?? []), s]);

  const items: DiscoveredItem[] = [];
  for (const [key, sources] of byKey) {
    const spend = sources.filter((s) => s.kind === "spend");
    const usage = sources.filter((s) => s.kind === "usage");
    // Prefer the accounting name (it's what finance recognises), then the sign-in name.
    const lead = spend.find((s) => s.name) ?? sources[0];
    const annual = spend.length ? spend.reduce((s, x) => s + (x.annual_spend ?? 0), 0) : null;
    const users = usage.length ? Math.max(...usage.map((u) => u.users ?? 0)) : null;
    const licensedVals = sources.map((s) => s.licensed).filter((x): x is number => x != null);
    const licensed = licensedVals.length ? Math.max(...licensedVals) : null;
    const category = sources.find((s) => s.category && s.category !== "Other")?.category ?? "Other";
    const state = states.get(key);

    let department_id: string | null = null;
    let reason = "No clear owner yet. Pick a department, or leave it for an admin.";
    if (state?.department_set) {
      department_id = state.department_id && depts.some((d) => d.id === state.department_id) ? state.department_id : null;
      reason = "Set by you";
    } else {
      const companyWide = isCompanyWide(key);
      const counts: Record<string, number> = {};
      for (const u of usage) for (const [d, n] of Object.entries(u.dept_counts ?? {})) counts[d] = (counts[d] ?? 0) + n;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const topDept = top ? matchDepartment(top[0], depts) : null;
      const hint = sources.map((s) => s.dept_hint).find(Boolean) ?? null;
      const hintDept = matchDepartment(hint, depts);
      if (!companyWide && topDept && total >= 2 && top[1] / total >= 0.5) {
        department_id = topDept.id;
        reason = `${top[1]} of ${total} people who sign in to it are in ${top[0]}`;
      } else if (hintDept) {
        department_id = hintDept.id;
        reason = companyWide ? `Used company-wide, so usually owned by ${hintDept.name}` : `Usually owned by ${hintDept.name}`;
      } else if (companyWide) {
        const fallback = matchDepartment("Operations", depts) ?? matchDepartment("Finance", depts);
        if (fallback) {
          department_id = fallback.id;
          reason = `Used company-wide; no IT department, so filed under ${fallback.name}`;
        }
      }
    }

    items.push({
      vendor_key: key,
      name: lead.name,
      category,
      sources: [...spend, ...usage],
      annual_spend: annual,
      users,
      licensed,
      department_id,
      department_reason: reason,
      status: state?.status ?? "new",
      tool_id: state?.tool_id ?? null,
      existing_tool_id: toolByKey.get(key) ?? null,
    });
  }
  return items.sort((a, b) => (b.annual_spend ?? 0) - (a.annual_spend ?? 0) || (b.users ?? 0) - (a.users ?? 0) || a.name.localeCompare(b.name));
}

/** The note a department owner sees on the imported tool. */
export function importDescription(item: DiscoveredItem): string {
  const parts = item.sources.map((s) => {
    const p = s.provider === "quickbooks" ? "QuickBooks" : s.provider === "xero" ? "Xero" : s.provider === "google" ? "Google Workspace" : "Microsoft";
    return `${p}: ${s.evidence ?? ""}`.trim();
  });
  return `Found automatically. ${parts.join(". ")}.`.slice(0, 1000);
}

/** Seats to pre-fill: paid licences when known, else people who sign in. */
export const importSeats = (item: DiscoveredItem) => item.licensed ?? item.users ?? null;
