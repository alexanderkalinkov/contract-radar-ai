"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { COMPANY } from "@/lib/seed";
import { usdShort } from "@/lib/format";
import { IconHelp, IconMenu, IconShield, IconUser, IconX, Logo } from "./icons";
import { tabMatches, useApprovalsBadge, useNav } from "./nav";
import { switchWorkspace } from "./DemoWorkspaceCard";
import { useWorkspace } from "./WorkspaceProvider";
import { cx } from "./ui";


export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ws = useWorkspace();
  const sections = useNav();
  const actionable = useApprovalsBadge();

  // Close the phone menu on navigation, Escape, or when the window grows to desktop width,
  // and stop the page behind it from scrolling while it is open.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => mq.matches && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [open]);

  return (
    <div className="sticky top-0 z-40 bg-navy lg:static lg:w-[232px] lg:flex-none">
    <nav
      aria-label="Main"
      className={cx(
        "flex flex-col gap-7 bg-navy px-4 py-3 text-white lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:overscroll-contain lg:py-6 short:gap-4 short:lg:py-4",
        open && "fixed inset-0 z-50 overflow-y-auto overscroll-contain pb-8 lg:static",
      )}
    >
      <div className="flex flex-none items-center justify-between px-2">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <Logo />
          <span className="font-brand text-lg font-semibold tracking-tight">Outflow</span>
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
      <div className={cx("flex-col gap-1 text-sm font-medium lg:flex short:gap-0.5", open ? "flex" : "hidden")}>
        {sections.map(({ label, Icon, tabs }) => {
          const active = tabs.some((t) => tabMatches(path, t));
          const badge = tabs.some((t) => t.badge === "approvals") ? actionable : 0;
          return (
            <Link
              key={label}
              href={tabs[0].href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-11 flex-none items-center gap-2.5 rounded-lg px-3 short:lg:min-h-10",
                active ? "bg-navy-active text-white" : "text-navy-text hover:bg-navy-hover hover:text-white",
              )}
            >
              <Icon />
              {label}
              {badge > 0 && (
                <span className="ml-auto rounded-full bg-[#FFB27A] px-2 py-0.5 text-[11px] font-bold text-navy" aria-label={`${badge} renewals need action`}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <div className={cx("mt-auto flex-none flex-col gap-2 lg:flex", open ? "flex" : "hidden")}>
        {ws.showSample && <div className="flex flex-col gap-1.5 rounded-xl bg-navy-2 p-4 short:lg:hidden">
        <span className="text-xs font-medium text-navy-muted">Spend under management</span>
        <span className="font-display text-[22px] font-semibold">{usdShort(COMPANY.spendUnderManagement)} / yr</span>
        <span className="text-xs text-navy-muted">
          {COMPANY.appsDetected} apps · {COMPANY.plan}
        </span>
        </div>}
        <BillingChip />
        <div className="flex flex-col gap-1 text-sm font-medium">
          {[
            { href: `/help${path.startsWith("/help") ? "" : `?from=${encodeURIComponent(path)}`}`, match: "/help", label: "Help & support", Icon: IconHelp },
            { href: "/account", match: "/account", label: "My account", Icon: IconUser },
            ...(ws.platformAdmin ? [{ href: "/admin", match: "/admin", label: "Platform admin", Icon: IconShield }] : []),
          ].map(({ href, match, label, Icon }) => (
            <Link
              key={match}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={path.startsWith(match) ? "page" : undefined}
              className={cx(
                "flex min-h-10 items-center gap-2.5 rounded-lg px-3 short:lg:min-h-9",
                path.startsWith(match) ? "bg-navy-active text-white" : "text-navy-text hover:bg-navy-hover hover:text-white",
              )}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </div>
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
              <Link href="/account" onClick={() => setOpen(false)} className="min-h-8 truncate leading-8 hover:text-white hover:underline" title="My account">
                {ws.name || ws.email}
              </Link>
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
