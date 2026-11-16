// Seat usage from login activity: who signed in to each app (Google Workspace and Microsoft Entra ID syncs),
// matched to what the contract or tool list says you pay for. Pure functions, shared by every view.
import { deptGroup, matchVendor } from "./discovery/catalog";
import { daysUntil } from "./engine";
import { shortDate } from "./format";
import { ACTIVE_DAYS, providerName, type IdlePerson, type Signal } from "./discovery/types";
import type { SavedContract } from "./saved";
import type { SeatUsage } from "./types";

/** What one vendor's sign-in data says, merged across sources. */
export interface VendorUsage {
  key: string;
  name: string;
  source: string; // "Google Workspace", "Microsoft 365 / Entra ID"
  users: number; // signed in during the window
  active: number; // signed in during the last activeDays
  activeDays: number;
  windowDays: number;
  lastLogin: string | null;
  licensed: number | null;
  idle: IdlePerson[];
  deptCounts: Record<string, number> | null;
}

const DEFAULT_WINDOW: Record<string, number> = { google: 90, microsoft: 30 };

/** Counts that are assignments or licences, not sign-ins, can't show who stopped using a tool. */
const notLogins = (s: Signal) => s.active_users == null && /assigned/i.test(s.evidence ?? "");

export function vendorUsage(signals: Signal[]): Map<string, VendorUsage> {
  const best = new Map<string, Signal>();
  for (const s of signals) {
    if (s.kind !== "usage" || !s.users || notLogins(s)) continue;
    const cur = best.get(s.vendor_key);
    const rank = (x: Signal) => (x.active_users != null ? 1_000_000 : 0) + (x.users ?? 0);
    if (!cur || rank(s) > rank(cur)) best.set(s.vendor_key, s);
  }
  const out = new Map<string, VendorUsage>();
  for (const [key, s] of best) {
    const window = s.window_days ?? DEFAULT_WINDOW[s.provider] ?? 30;
    const hasActive = s.active_users != null;
    out.set(key, {
      key,
      name: s.name,
      source: providerName(s.provider).replace(" / Entra ID", ""),
      users: s.users ?? 0,
      // Rows synced before the login columns existed only know "signed in during the window".
      active: hasActive ? Math.min(s.active_users!, s.users ?? 0) : s.users ?? 0,
      activeDays: hasActive ? Math.min(ACTIVE_DAYS, window) : window,
      windowDays: window,
      lastLogin: s.last_login ?? null,
      licensed: s.licensed,
      idle: s.idle_people ?? [],
      deptCounts: s.dept_counts,
    });
  }
  return out;
}

/** Paid seats against sign-ins. `share` scales the counts when several contracts or tools split one vendor. */
export function toSeatUsage(v: VendorUsage, paid: number, share = 1): SeatUsage | undefined {
  if (!(paid > 0)) return undefined;
  const seen = Math.min(Math.round(v.users * share), paid);
  const active = Math.min(Math.round(v.active * share), seen);
  const inactive = Math.max(0, seen - active);
  return {
    paid,
    active,
    inactive,
    neverSignedIn: Math.max(0, paid - active - inactive),
    source: v.source,
    activeDays: v.activeDays,
    windowDays: v.windowDays,
    lastLogin: v.lastLogin,
    idle: share === 1 ? v.idle : [],
    live: true,
  };
}

/** The keys a contract could be filed under: the agreement name first ("Tableau Cloud…" from "Salesforce, Inc."), then the vendor. */
function contractKeys(s: SavedContract): string[] {
  const keys: string[] = [];
  const agreement = matchVendor(s.data.agreement_name ?? "");
  if (agreement.known) keys.push(agreement.key);
  keys.push(matchVendor(s.data.vendor).key);
  return keys;
}

export function usageForContract(s: SavedContract, usage: Map<string, VendorUsage>): SeatUsage | undefined {
  for (const k of contractKeys(s)) {
    const v = usage.get(k);
    if (v) return toSeatUsage(v, s.data.seats.value ?? v.licensed ?? 0);
  }
  return undefined;
}

interface ToolLike {
  id: string;
  name: string;
  seats: number | null;
  department_id: string | null;
}

/**
 * Usage per tool. When two departments buy the same product separately (Sales' Zoom and Operations' Zoom),
 * each gets the sign-ins from its own department, using the directory department of each person.
 */
export function usageForTools<T extends ToolLike>(tools: T[], deptName: (id: string | null) => string | null, usage: Map<string, VendorUsage>): Map<string, SeatUsage> {
  const byKey = new Map<string, T[]>();
  for (const t of tools) {
    const k = matchVendor(t.name).key;
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  const out = new Map<string, SeatUsage>();
  for (const [key, list] of byKey) {
    const v = usage.get(key);
    if (!v) continue;
    for (const t of list) {
      const paid = t.seats ?? (list.length === 1 ? v.licensed ?? 0 : 0);
      if (list.length === 1) {
        const u = toSeatUsage(v, paid);
        if (u) out.set(t.id, u);
        continue;
      }
      const name = deptName(t.department_id);
      if (!name || !v.deptCounts || !v.users) continue;
      const g = deptGroup(name);
      const n = Object.entries(v.deptCounts)
        .filter(([label]) => label.toLowerCase() === name.toLowerCase() || (g != null && deptGroup(label) === g))
        .reduce((sum, [, c]) => sum + c, 0);
      const u = n ? toSeatUsage(v, paid, n / v.users) : undefined;
      if (u) out.set(t.id, u);
    }
  }
  return out;
}

export const unusedSeats = (u: SeatUsage) => Math.max(0, u.paid - u.active);

/** Worth a "cut seats" recommendation: at least 2 seats and a tenth of the contract unused. */
export const worthCutting = (u: SeatUsage) => unusedSeats(u) >= Math.max(2, Math.ceil(u.paid * 0.1));

/** "No sign-in in 30 days" or, for sample data written per 60 days, "inactive 60+ days". */
export const activeLabel = (u: SeatUsage) => `${u.activeDays ?? 60} days`;

/** "today", "3 days ago", "Oct 2". */
export function sinceLabel(iso: string): string {
  const d = -daysUntil(iso);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  return shortDate(iso);
}

export function usageSentence(u: SeatUsage): string {
  const parts = [`${u.active} of ${u.paid} seats signed in during the last ${activeLabel(u)}`];
  if (u.lastLogin) parts.push(`latest sign-in ${sinceLabel(u.lastLogin)}`);
  return `${parts.join(", ")} (${u.source})`;
}
