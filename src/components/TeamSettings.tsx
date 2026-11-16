"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import { btnGhost, btnPrimary, Card, H2 } from "./ui";

export type Member = { user_id: string; email: string; role: "owner" | "member"; created_at: string };
export type Invite = { id: string; email: string; created_at: string };

export function TeamSettings({ members, invites }: { members: Member[]; invites: Invite[]; currentUserId?: string | null }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState(ws.workspaceName);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, init: RequestInit, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setMsg({ ok: true, text: ok });
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      {!ws.isDemo && <Card label="Sample data" className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex flex-col gap-1">
          <H2>Sample data</H2>
          <span className="text-[13px] text-muted">
            Show the fictional Northwind Logistics portfolio next to your own contracts. Handy for demos; turn it off to see
            only your team&apos;s data.
          </span>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#1D4ED8]"
            checked={ws.showSample}
            onChange={(e) => ws.setShowSample(e.target.checked)}
          />
          {ws.showSample ? "Shown" : "Hidden"}
        </label>
      </Card>}

      {ws.mode === "demo" ? (
        <Card label="Team" className="flex flex-col gap-3 p-5">
          <H2>Share with your team</H2>
          <p className="m-0 text-sm text-ink-2">
            You&apos;re in demo mode: there&apos;s no login, and uploaded contracts are saved in this browser only. To get a
            shared workspace your partner can sign in to, connect a Supabase project. The steps are in the README under
            &ldquo;Turn on login and a shared workspace&rdquo;.
          </p>
        </Card>
      ) : (
        <>
          <Card label="Workspace" className="flex flex-col gap-3 p-5">
            <H2>Workspace name</H2>
            <form
              className="flex flex-wrap gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                call("/api/workspace", { method: "PATCH", body: JSON.stringify({ name }) }, "Workspace renamed.");
              }}
            >
              <label htmlFor="ws-name" className="sr-only">Workspace name</label>
              <input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="min-h-11 min-w-[240px] flex-1 rounded-[10px] border border-[#D0D5DD] px-3 text-sm" />
              <button type="submit" className={btnGhost} disabled={busy || !name.trim()}>Save</button>
            </form>
          </Card>

          <Card label="Team" className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex flex-col gap-1">
              <H2>Team and departments</H2>
              <span className="text-[13px] text-muted">
                {members.length} member{members.length === 1 ? "" : "s"}
                {invites.length ? ` · ${invites.length} invited` : ""}. Invite department owners and set roles on the Team page.
              </span>
            </div>
            <Link href="/team" className={btnPrimary}>Open Team</Link>
          </Card>
        </>
      )}
      {msg && (
        <p role="status" className={msg.ok ? "m-0 text-sm text-good-dark" : "m-0 text-sm text-[#912018]"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
