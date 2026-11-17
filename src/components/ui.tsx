import { urgency, type Urgency } from "@/lib/engine";
import { inDays } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function VendorLogo({ initials, hue, size = 36 }: { initials: string; hue: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center font-bold text-white"
      style={{ width: size, height: size, borderRadius: size / 4, background: hue, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}

const urgencyClass: Record<Urgency, string> = {
  urgent: "bg-urgent text-white",
  soon: "bg-warn-soft text-warn-text",
  later: "bg-chip text-ink-2",
  past: "bg-ink text-white",
};

export function urgencyClassFor(days: number) {
  return urgencyClass[urgency(days)];
}

export function DaysBadge({ days }: { days: number }) {
  return (
    <span className={cx("inline-block w-fit rounded-md px-2 py-0.5 text-xs font-semibold", urgencyClassFor(days))}>
      {inDays(days)}
    </span>
  );
}

export function Card({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={cx("rounded-[14px] border border-line bg-white", className)}>
      {children}
    </section>
  );
}

export function H2({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cx("m-0 font-display text-[19px] font-semibold", className)}>{children}</h2>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        {eyebrow && <span className="text-[13px] font-medium text-muted">{eyebrow}</span>}
        <h1 className="m-0 font-display text-[30px] font-semibold tracking-tight">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2.5">{children}</div>}
    </header>
  );
}

export function ConfidenceTag({ level }: { level: "high" | "medium" | "low" }) {
  const cls =
    level === "high"
      ? "bg-good-soft text-good-dark"
      : level === "medium"
        ? "bg-warn-soft text-warn-text"
        : "bg-[#FEE4E2] text-[#912018]";
  return <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", cls)}>{level} confidence</span>;
}

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
export const btnGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[#D0D5DD] bg-white px-4 text-sm font-semibold text-ink hover:bg-[#EEF2F7]";
export const btnSoft =
  "inline-flex min-h-10 items-center rounded-[9px] border border-brand-line bg-brand-soft px-3.5 text-[13px] font-semibold text-brand-dark hover:bg-[#E0E7FF]";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-[10px] bg-chip p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-9 rounded-lg px-3 text-[13px] font-semibold",
            value === o.value ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.12)]" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
