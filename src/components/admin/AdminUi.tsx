"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ROLES, type Role } from "@/lib/roles";
import { cx } from "@/components/ui";

// Client pieces of the platform admin console. Every change goes through POST /api/admin, which checks
// platform admin access again on the server; these components only send the request and refresh the page.

type Payload = Record<string, unknown> & { action: string };
const MSG_EVENT = "cr-admin-msg";

function say(ok: boolean, text: string) {
  window.dispatchEvent(new CustomEvent(MSG_EVENT, { detail: { ok, text } }));
}

export function useAdminAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (payload: Payload): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !json.ok) {
        say(false, json.error ?? "Something went wrong.");
        return false;
      }
      say(true, json.message ?? "Done.");
      router.refresh();
      return true;
    } catch {
      say(false, "Network error. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

/** Toast for action results, shown at the bottom of the screen. */
export function AdminToast() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      setMsg((e as CustomEvent).detail);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 6000);
    };
    window.addEventListener(MSG_EVENT, on);
    return () => {
      window.removeEventListener(MSG_EVENT, on);
      clearTimeout(t);
    };
  }, []);
  if (!msg) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-4 z-50 flex justify-center">
      <div
        className={cx(
          "cr-page-in flex max-w-xl items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg",
          msg.ok ? "border-good-line bg-good-soft text-good-dark" : "border-[#FDA29B] bg-[#FEF3F2] text-[#912018]",
        )}
      >
        <span className="flex-1">{msg.text}</span>
        <button type="button" onClick={() => setMsg(null)} className="font-semibold opacity-70 hover:opacity-100" aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}

const small = "cr-press inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 text-[13px] font-semibold disabled:opacity-50";
const tones = {
  default: "border border-[#D0D5DD] bg-white text-ink hover:bg-[#EEF2F7]",
  brand: "border border-brand-line bg-brand-soft text-brand-dark hover:bg-[#E0E7FF]",
  danger: "border border-[#FDA29B] bg-white text-[#B42318] hover:bg-[#FEF3F2]",
};

/** A button that runs one admin action. With `confirm`, the first click asks and the second one runs it. */
export function ActionButton({
  payload,
  label,
  confirm,
  tone = "default",
}: {
  payload: Payload;
  label: string;
  confirm?: string;
  tone?: keyof typeof tones;
}) {
  const { run, busy } = useAdminAction();
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 5000);
    return () => clearTimeout(t);
  }, [asking]);
  if (asking) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">{confirm}</span>
        <button type="button" disabled={busy} className={cx(small, tone === "danger" ? "bg-[#B42318] text-white hover:bg-[#912018]" : "bg-brand text-white hover:bg-brand-dark")} onClick={async () => { await run(payload); setAsking(false); }}>
          Yes
        </button>
        <button type="button" data-nobusy className={cx(small, tones.default)} onClick={() => setAsking(false)}>
          No
        </button>
      </span>
    );
  }
  return (
    <button type="button" disabled={busy} className={cx(small, tones[tone])} onClick={() => (confirm ? setAsking(true) : run(payload))} data-nobusy={confirm ? true : undefined}>
      {label}
    </button>
  );
}

export function RoleSelect({ workspaceId, userId, role }: { workspaceId: string; userId: string; role: Role }) {
  const { run, busy } = useAdminAction();
  return (
    <select
      aria-label="Role"
      value={role}
      disabled={busy}
      onChange={(e) => run({ action: "member.role", workspaceId, userId, role: e.target.value })}
      className="min-h-9 rounded-[9px] border border-[#D0D5DD] bg-white px-2 text-[13px] font-semibold"
    >
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

export function TrialExtender({ workspaceId }: { workspaceId: string }) {
  const { run, busy } = useAdminAction();
  const [days, setDays] = useState("14");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run({ action: "billing.trial", workspaceId, days: Number(days) });
      }}
    >
      <label className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
        Extend trial by
        <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className="min-h-9 w-16 rounded-[9px] border border-[#D0D5DD] px-2 text-[13px]" aria-label="Days" />
        days
      </label>
      <button type="submit" disabled={busy || !days} className={cx(small, tones.brand)}>
        Extend
      </button>
    </form>
  );
}

export function RenameWorkspace({ workspaceId, name }: { workspaceId: string; name: string }) {
  const { run, busy } = useAdminAction();
  const [value, setValue] = useState(name);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run({ action: "workspace.rename", workspaceId, name: value });
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} aria-label="Workspace name" className="min-h-9 min-w-0 flex-1 rounded-[9px] border border-[#D0D5DD] px-2.5 text-sm" />
      <button type="submit" disabled={busy || !value.trim() || value.trim() === name} className={cx(small, tones.default)}>
        Rename
      </button>
    </form>
  );
}

export function DeleteUser({ userId, email }: { userId: string; email: string }) {
  const { run, busy } = useAdminAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  if (!open) {
    return (
      <button type="button" data-nobusy className={cx(small, tones.danger)} onClick={() => setOpen(true)}>
        Delete account…
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-2 rounded-xl border border-[#FDA29B] bg-[#FEF3F2] p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ action: "user.delete", userId, confirm: typed })) router.push("/admin/users");
      }}
    >
      <span className="text-[13px] text-[#912018]">
        This deletes the account and removes them from every workspace. Their contracts stay in the workspace. It can&apos;t be undone. Type <b>{email}</b> to confirm.
      </span>
      <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type the email to confirm" className="min-h-9 rounded-[9px] border border-[#FDA29B] bg-white px-2.5 text-sm" />
      <span className="flex gap-2">
        <button type="submit" disabled={busy || typed.trim().toLowerCase() !== email.toLowerCase()} className={cx(small, "bg-[#B42318] text-white hover:bg-[#912018]")}>
          Delete for good
        </button>
        <button type="button" data-nobusy className={cx(small, tones.default)} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </span>
    </form>
  );
}

export function SupportResolve({ id }: { id: string }) {
  const { run, busy } = useAdminAction();
  const [note, setNote] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run({ action: "support.resolve", id, note });
      }}
    >
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (optional)" maxLength={2000} aria-label="Internal note" className="min-h-9 min-w-0 flex-1 rounded-[9px] border border-[#D0D5DD] px-2.5 text-[13px]" />
      <button type="submit" disabled={busy} className={cx(small, tones.brand)}>
        Mark resolved
      </button>
    </form>
  );
}

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/workspaces", label: "Workspaces" },
  { href: "/admin/billing", label: "Subscriptions" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/setup", label: "Setup & health" },
];

export function AdminTabs({ supportOpen }: { supportOpen: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin sections" className="overflow-x-auto">
      <div className="flex min-w-max gap-1">
        {TABS.map((t) => {
          const on = t.href === "/admin" ? path === "/admin" : path === t.href || path.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-200",
                on ? "border-white text-white" : "border-transparent text-navy-text hover:text-white",
              )}
            >
              {t.label}
              {t.href === "/admin/support" && supportOpen > 0 && (
                <span className="rounded-full bg-[#FFB27A] px-2 py-0.5 text-[11px] font-bold text-navy" aria-label={`${supportOpen} open`}>
                  {supportOpen}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

