"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { COMPANY } from "@/lib/seed";
import { usdShort } from "@/lib/format";
import { IconCal, IconCard, IconChart, IconCheck, IconDoc, IconGear, IconHome, IconList, IconMenu, IconPlug, IconSpark, IconTeam, IconTrend, IconUsers, IconX, Logo } from "./icons";
import { switchWorkspace } from "./DemoWorkspaceCard";
import { useWorkspace } from "./WorkspaceProvider";
import { useRenewalQueue } from "@/lib/useRenewalQueue";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Savings", Icon: IconHome },
  { href: "/insights", label: "Leadership view", Icon: IconChart, adminOnly: true },
  { href: "/tools", label: "Tools & survey", Icon: IconList },
  { href: "/discover", label: "Discovered tools", Icon: IconSpark },
  { href: "/contracts", label: "Contracts", Icon: IconDoc },
  { href: "/calendar", label: "Renewal calendar", Icon: IconCal },
  { href: "/approvals", label: "Renewal approvals", Icon: IconCheck },
  { href: "/seats", label: "Seats & usage", Icon: IconUsers },
  { href: "/price-changes", label: "Price changes", Icon: IconTrend },
  { href: "/sources", label: "Sources", Icon: IconPlug },
  { href: "/team", label: "Team", Icon: IconTeam },
  { href: "/settings", label: "Workspace", Icon: IconGear },
  { href: "/billing", label: "Billing", Icon: IconCard, adminOnly: true, cloudOnly: true },
];

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ws = useWorkspace();
  const queue = useRenewalQueue();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="bg-navy lg:w-[232px] lg:flex-none">
    <nav
      aria-label="Main"
      className="flex flex-col gap-7 px-4 py-4 text-white lg:sticky lg:top-0 lg:h-screen lg:py-6"
    >
      <div className="flex items-center justify-between px-2">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight">Contract Radar</span>
        </Link>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-navy-text hover:bg-navy-hover lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <IconX /> : <IconMenu />}
        </button>
      </div>
      <div className={cx("flex-col gap-1 text-sm font-medium lg:flex", open ? "flex" : "hidden")}>
        {NAV.filter((n) => !("cloudOnly" in n && n.cloudOnly && !ws.billing?.enabled) && (!n.adminOnly || ws.mode === "demo" || ws.role === "owner")).map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={isActive(href) ? "page" : undefined}
            className={cx(
              "flex min-h-11 items-center gap-2.5 rounded-lg px-3",
              isActive(href) ? "bg-navy-active text-white" : "text-navy-text hover:bg-navy-hover hover:text-white",
            )}
          >
            <Icon />
            {label}
            {href === "/approvals" && queue.actionable > 0 && (
              <span className="ml-auto rounded-full bg-[#FFB27A] px-2 py-0.5 text-[11px] font-bold text-navy" aria-label={`${queue.actionable} need action`}>
                {queue.actionable}
              </span>
            )}
          </Link>
        ))}
      </div>
      <div className={cx("mt-auto flex-col gap-2 lg:flex", open ? "flex" : "hidden")}>
        {ws.showSample && <div className="flex flex-col gap-1.5 rounded-xl bg-navy-2 p-4">
        <span className="text-xs font-medium text-navy-muted">Spend under management</span>
        <span className="font-display text-[22px] font-semibold">{usdShort(COMPANY.spendUnderManagement)} / yr</span>
        <span className="text-xs text-navy-muted">
          {COMPANY.appsDetected} apps · {COMPANY.plan}
        </span>
        </div>}
        <BillingChip />
        <div className="flex flex-col gap-1 px-2 text-xs text-navy-muted">
          {ws.workspaces && ws.workspaces.length > 1 ? (
            <label className="flex flex-col gap-1">
              <span className="sr-only">Workspace</span>
              <select
                value={ws.workspaceId}
                onChange={(e) => switchWorkspace(e.target.value)}
                className="min-h-10 w-full truncate rounded-lg border border-navy-active bg-navy-2 px-2 text-[13px] font-semibold text-white"
              >
                {ws.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="truncate font-semibold text-white">{ws.workspaceName}</span>
          )}
          {ws.isDemo && (
            <Link href="/settings" className="w-fit rounded-full bg-[#FFB27A] px-2 py-0.5 text-[11px] font-bold text-navy">
              Demo data · reset in Workspace
            </Link>
          )}
          {ws.mode === "cloud" ? (
            <form action="/auth/signout" method="post" className="flex items-center justify-between gap-2">
              <span className="truncate">{ws.email}</span>
              <button type="submit" className="min-h-8 flex-none rounded px-1 font-semibold text-navy-text hover:text-white">
                Sign out
              </button>
            </form>
          ) : (
            <span>Demo mode · data stays in this browser</span>
          )}
        </div>
      </div>
    </nav>
    </div>
  );
}

/** Trial countdown or payment warning above the account line. */
function BillingChip() {
  const b = useWorkspace().billing;
  if (!b?.enabled) return null;
  let text: string | null = null;
  if (b.state === "trial") text = b.trialDaysLeft === 1 ? "Free trial: last day" : `Free trial: ${b.trialDaysLeft} days left`;
  else if (b.state === "past_due") text = "Payment failed: update your card";
  else if (b.state === "trial_ended" || b.state === "canceled") text = "Choose a plan to continue";
  if (!text) return null;
  return (
    <Link href="/billing" className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-navy-2 px-4 py-2.5 text-xs font-semibold text-white hover:bg-navy-hover">
      <span>{text}</span>
      <span aria-hidden="true" className="text-navy-muted">→</span>
    </Link>
  );
}
