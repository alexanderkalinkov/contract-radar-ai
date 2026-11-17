import Link from "next/link";
import type { BillingSummary } from "@/lib/billing/plans";
import { planById } from "@/lib/billing/plans";
import type { UserStatus } from "@/lib/server/platform-data";
import { cx } from "@/components/ui";

// Small server-rendered pieces shared by the admin pages.

export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "—";

export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 0) return "just now";
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d} days ago`;
  return day(iso);
}

type Tone = "good" | "warn" | "bad" | "muted" | "brand";
const toneCls: Record<Tone, string> = {
  good: "bg-good-soft text-good-dark",
  warn: "bg-warn-soft text-warn-text",
  bad: "bg-[#FEE4E2] text-[#912018]",
  muted: "bg-chip text-ink-2",
  brand: "bg-brand-soft text-brand-dark",
};

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cx("inline-block w-fit rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", toneCls[tone])}>{children}</span>;
}

export function UserStatusPill({ status }: { status: UserStatus }) {
  const map: Record<UserStatus, [Tone, string]> = {
    active: ["good", "Active"],
    disabled: ["bad", "Disabled"],
    unconfirmed: ["warn", "Email not confirmed"],
    invited: ["warn", "Invited, not joined"],
  };
  const [tone, label] = map[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function billingLabel(b: BillingSummary | null): [Tone, string] {
  if (!b) return ["muted", "Billing off"];
  const plan = planById(b.plan)?.name;
  switch (b.state) {
    case "complimentary":
      return ["brand", "Free forever"];
    case "active":
      return ["good", `${plan ?? "Paid"}${b.interval ? ` · ${b.interval === "year" ? "yearly" : "monthly"}` : ""}${b.cancelAtPeriodEnd ? " · ending" : ""}`];
    case "past_due":
      return ["bad", `${plan ?? "Paid"} · payment failed`];
    case "trial":
      return ["warn", `Trial · ${b.trialDaysLeft} day${b.trialDaysLeft === 1 ? "" : "s"} left`];
    case "trial_ended":
      return ["bad", "Trial ended"];
    case "canceled":
      return ["bad", "Cancelled"];
    default:
      return ["muted", "Billing off"];
  }
}

export function BillingPill({ billing }: { billing: BillingSummary | null }) {
  const [tone, label] = billingLabel(billing);
  return <Pill tone={tone}>{label}</Pill>;
}

export function Stat({ label, value, sub, href, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; tone?: "warn" | "bad" }) {
  const body = (
    <>
      <span className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</span>
      <span className={cx("font-display text-[26px] font-semibold", tone === "bad" ? "text-[#B42318]" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </>
  );
  const cls = "flex flex-col gap-1 rounded-[14px] border border-line bg-white p-4";
  return href ? (
    <Link href={href} className={cx(cls, "transition-colors hover:border-brand-line")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={cx("px-3 py-3 font-semibold first:pl-5 last:pr-5", className)}>
      {children}
    </th>
  );
}

export function SetupNeeded({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[14px] border border-warn-line bg-warn-soft p-4 text-sm text-warn-text">{children}</div>;
}
