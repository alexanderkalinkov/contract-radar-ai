"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canApproveRenewals } from "@/lib/roles";
import { useRenewalQueue } from "@/lib/useRenewalQueue";
import { IconCal, IconChart, IconDoc, IconGear, IconHome, IconList } from "./icons";

type IconType = typeof IconHome;
import { cx } from "./ui";
import { useWorkspace } from "./WorkspaceProvider";

/**
 * App navigation. The sidebar shows a handful of sections; pages that belong together share a
 * section and get a tab bar at the top of the page (SectionTabs). Routes are unchanged.
 */
type Tab = {
  href: string;
  label: string;
  /** Extra path prefixes that count as this tab (detail pages, sub-flows). */
  match?: string[];
  leadersOnly?: boolean;
  adminOnly?: boolean;
  /** Only when Stripe billing is enabled. */
  billingOnly?: boolean;
  /** Hidden in local demo mode (no database). */
  cloudOnly?: boolean;
  badge?: "approvals";
};

type Section = { label: string; Icon: IconType; tabs: Tab[] };

export const SECTIONS: Section[] = [
  { label: "Savings", Icon: IconHome, tabs: [{ href: "/", label: "Savings" }] },
  { label: "Leadership view", Icon: IconChart, tabs: [{ href: "/insights", label: "Leadership view", leadersOnly: true }] },
  {
    label: "Contracts",
    Icon: IconDoc,
    tabs: [
      { href: "/contracts", label: "All contracts", match: ["/upload"] },
      { href: "/import", label: "Bulk import" },
    ],
  },
  {
    label: "Renewals",
    Icon: IconCal,
    tabs: [
      { href: "/calendar", label: "Calendar" },
      { href: "/approvals", label: "Approvals", badge: "approvals" },
      { href: "/price-changes", label: "Price changes" },
    ],
  },
  {
    label: "Tools & seats",
    Icon: IconList,
    tabs: [
      { href: "/tools", label: "Tools & survey" },
      { href: "/discover", label: "Discovered tools" },
      { href: "/seats", label: "Seats & usage" },
    ],
  },
  {
    label: "Settings",
    Icon: IconGear,
    tabs: [
      { href: "/settings", label: "Workspace" },
      { href: "/team", label: "Team" },
      { href: "/sources", label: "Sources" },
      { href: "/billing", label: "Billing", adminOnly: true, billingOnly: true },
      { href: "/audit", label: "Audit log", leadersOnly: true, cloudOnly: true },
    ],
  },
];

const matches = (path: string, prefix: string) => (prefix === "/" ? path === "/" : path === prefix || path.startsWith(prefix + "/"));
export const tabMatches = (path: string, t: Tab) => [t.href, ...(t.match ?? [])].some((p) => matches(path, p));

/** Sections and tabs this person can see. Sections with no visible tabs are dropped. */
export function useNav() {
  const ws = useWorkspace();
  const demo = ws.mode === "demo";
  const visible = (t: Tab) =>
    !(t.billingOnly && !ws.billing?.enabled) &&
    !(t.cloudOnly && demo) &&
    (!t.adminOnly || demo || ws.role === "owner") &&
    (!t.leadersOnly || demo || canApproveRenewals(ws.role));
  return SECTIONS.map((s) => ({ ...s, tabs: s.tabs.filter(visible) })).filter((s) => s.tabs.length > 0);
}

export function useApprovalsBadge() {
  return useRenewalQueue().actionable;
}

/** Tab bar shown at the top of pages that share a sidebar section. */
export function SectionTabs() {
  const path = usePathname();
  const sections = useNav();
  const badge = useApprovalsBadge();
  const section = sections.find((s) => s.tabs.some((t) => tabMatches(path, t)));
  if (!section || section.tabs.length < 2) return null;
  return (
    <nav aria-label={section.label} className="-mb-2 overflow-x-auto border-b border-line">
      <div className="flex min-w-max gap-1">
        {section.tabs.map((t) => {
          const on = tabMatches(path, t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap",
                on ? "border-brand text-ink" : "border-transparent text-muted hover:border-line hover:text-ink",
              )}
            >
              {t.label}
              {t.badge === "approvals" && badge > 0 && (
                <span className="rounded-full bg-[#FFB27A] px-2 py-0.5 text-[11px] font-bold text-navy" aria-label={`${badge} need action`}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
