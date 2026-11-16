"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Card, H2, btnGhost, btnPrimary, btnSoft } from "@/components/ui";
import { roleLabel } from "@/lib/roles";
import { openTour, TOUR_POSTER } from "./Tour";

const field = "min-h-11 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm";
const label = "text-[13px] font-semibold text-ink-2";

type Status = { tone: "ok" | "error"; text: string } | null;

function Alert({ status }: { status: Status }) {
  if (!status) return null;
  return status.tone === "ok" ? (
    <p role="status" className="m-0 rounded-lg bg-good-soft px-3 py-2 text-sm text-good-dark">{status.text}</p>
  ) : (
    <p role="alert" className="m-0 rounded-lg bg-[#FEF3F2] px-3 py-2 text-sm text-[#912018]">{status.text}</p>
  );
}

export function ProfileCard({ jobTitle }: { jobTitle: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ full_name: String(f.get("full_name") ?? ""), job_title: String(f.get("job_title") ?? "") }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { ok?: boolean; error?: string } | undefined;
    setBusy(false);
    if (res?.ok && json?.ok) {
      setStatus({ tone: "ok", text: "Saved." });
      router.refresh();
    } else setStatus({ tone: "error", text: json?.error ?? "Couldn't save. Try again." });
  }

  return (
    <Card className="flex flex-col gap-5 p-6" label="Profile">
      <div className="flex flex-col gap-1">
        <H2>Profile</H2>
        <p className="m-0 text-sm text-muted">Your name shows on approvals and in emails your team gets from you.</p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="full_name" className={label}>Full name</label>
            <input id="full_name" name="full_name" defaultValue={ws.name ?? ""} maxLength={100} autoComplete="name" className={field} placeholder="Jordan Lee" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="job_title" className={label}>Job title</label>
            <input id="job_title" name="job_title" defaultValue={jobTitle} maxLength={100} autoComplete="organization-title" className={field} placeholder="Head of Finance" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={label}>Email</span>
          <span className="text-sm text-ink">{ws.email}</span>
          <span className="text-xs text-muted">
            Need to change it? <Link href="/help?topic=account#support" className="font-semibold text-brand underline">Ask support</Link> and we&apos;ll move your account over.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={label}>Workspace and role</span>
          <span className="text-sm text-ink">
            {ws.workspaceName} · {roleLabel(ws.role ?? "member")}
          </span>
          <span className="text-xs text-muted">Roles are set by your workspace admin on the Team page.</span>
        </div>
        <Alert status={status} />
        <button type="submit" disabled={busy} className={`${btnPrimary} w-fit`}>{busy ? "Saving…" : "Save profile"}</button>
      </form>
    </Card>
  );
}

export function PasswordCard() {
  const ws = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  if (ws.viaSso) {
    return (
      <Card className="flex flex-col gap-2 p-6" label="Password">
        <H2>Password</H2>
        <p className="m-0 text-sm text-muted">You sign in through your company&apos;s single sign-on, so your password is managed there.</p>
      </Card>
    );
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const password = String(f.get("password") ?? "");
    if (password !== String(f.get("confirm") ?? "")) {
      setStatus({ tone: "error", text: "The two new passwords don't match." });
      return;
    }
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ current: String(f.get("current") ?? ""), password }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { ok?: boolean; error?: string } | undefined;
    setBusy(false);
    if (res?.ok && json?.ok) {
      form.reset();
      setStatus({ tone: "ok", text: "Password changed. Use the new one next time you sign in." });
    } else setStatus({ tone: "error", text: json?.error ?? "Couldn't change your password. Try again." });
  }

  return (
    <Card className="flex flex-col gap-5 p-6" label="Password">
      <div className="flex flex-col gap-1">
        <H2>Change password</H2>
        <p className="m-0 text-sm text-muted">At least 8 characters. You&apos;ll stay signed in on this device.</p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-4">
        <input type="email" name="username" autoComplete="username" value={ws.email ?? ""} readOnly hidden />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="current" className={label}>Current password</label>
          <input id="current" name="current" type="password" required autoComplete="current-password" className={field} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className={label}>New password</label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className={label}>Repeat new password</label>
            <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className={field} />
          </div>
        </div>
        <Alert status={status} />
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Change password"}</button>
          <Link href="/login/forgot" className="text-sm font-semibold text-brand underline">Forgot your current password?</Link>
        </div>
      </form>
    </Card>
  );
}

export function SignOutCard() {
  return (
    <Card className="flex flex-col gap-4 p-6" label="Sign out">
      <div className="flex flex-col gap-1">
        <H2>Sign out</H2>
        <p className="m-0 text-sm text-muted">Lost a laptop or used a shared computer? Sign out everywhere to end every session at once.</p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <form action="/auth/signout" method="post">
          <button type="submit" className={btnPrimary}>Sign out</button>
        </form>
        <form action="/auth/signout?scope=global" method="post">
          <button type="submit" className={btnGhost}>Sign out on all devices</button>
        </form>
      </div>
    </Card>
  );
}

export function HelpCard() {
  return (
    <Card className="flex flex-col gap-4 p-6" label="Help">
      <div className="flex flex-col gap-1">
        <H2>Getting started</H2>
        <p className="m-0 text-sm text-muted">A 6-minute tour of setting up your company, adding contracts and acting on renewals.</p>
      </div>
      <button type="button" onClick={openTour} className="group relative w-full max-w-[420px] overflow-hidden rounded-xl text-left" aria-label="Play the 6-minute tour">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={TOUR_POSTER} alt="" className="aspect-[16/10] w-full object-cover" />
        <span className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/95 py-1.5 pr-3.5 pl-1.5 text-[13px] font-semibold text-ink shadow-lg group-hover:bg-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          </span>
          Play · 6 min
        </span>
      </button>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={openTour} className={btnSoft}>Watch the tour</button>
        <Link href="/help#support" className={btnSoft}>Contact support</Link>
      </div>
    </Card>
  );
}
