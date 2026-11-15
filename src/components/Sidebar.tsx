"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { COMPANY } from "@/lib/seed";
import { usdShort } from "@/lib/format";
import { IconCal, IconDoc, IconHome, IconMenu, IconPlug, IconTrend, IconUsers, IconX, Logo } from "./icons";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Savings", Icon: IconHome },
  { href: "/contracts", label: "Contracts", Icon: IconDoc },
  { href: "/calendar", label: "Renewal calendar", Icon: IconCal },
  { href: "/seats", label: "Seats & usage", Icon: IconUsers },
  { href: "/price-changes", label: "Price changes", Icon: IconTrend },
  { href: "/sources", label: "Sources", Icon: IconPlug },
];

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
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
        {NAV.map(({ href, label, Icon }) => (
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
          </Link>
        ))}
      </div>
      <div className="mt-auto hidden flex-col gap-1.5 rounded-xl bg-navy-2 p-4 lg:flex">
        <span className="text-xs font-medium text-navy-muted">Spend under management</span>
        <span className="font-display text-[22px] font-semibold">{usdShort(COMPANY.spendUnderManagement)} / yr</span>
        <span className="text-xs text-navy-muted">
          {COMPANY.appsDetected} apps · {COMPANY.plan}
        </span>
      </div>
    </nav>
    </div>
  );
}
