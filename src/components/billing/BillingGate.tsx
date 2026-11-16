"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { btnPrimary, Card, H2 } from "@/components/ui";

// Pages that stay open after the trial ends, so people can pay, manage the team or sign out.
const ALWAYS_OPEN = ["/billing", "/settings"];

/** Once the free trial (or a subscription) has ended, every page except Billing shows a paywall. */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const ws = useWorkspace();
  const path = usePathname();
  const b = ws.billing;
  if (!b?.enabled || b.access || ALWAYS_OPEN.some((p) => path === p || path.startsWith(p + "/"))) return <>{children}</>;

  const isAdmin = ws.role === "owner";
  const ended = b.state === "canceled" ? "Your subscription has ended" : "Your free trial has ended";
  return (
    <Card className="mx-auto mt-10 flex w-full max-w-[560px] flex-col gap-4 p-7" label="Plan needed">
      <H2>{ended}</H2>
      <p className="m-0 text-[15px] leading-relaxed text-ink-2">
        Your contracts, tools and reminders are saved. {isAdmin ? "Choose a plan to pick up where you left off." : "Ask a workspace admin to choose a plan to pick up where you left off."}
      </p>
      {isAdmin && (
        <Link href="/billing" className={btnPrimary + " w-fit"}>
          See plans
        </Link>
      )}
    </Card>
  );
}
