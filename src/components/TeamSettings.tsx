"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import { btnGhost, btnPrimary, Card, H2 } from "./ui";

export type Member = { user_id: string; email: string; role: "owner" | "member"; created_at: string };
export type Invite = { id: string; email: string; created_at: string };

export function TeamSettings({ members, invites, currentUserId }: { members: Member[]; invites: Invite[]; currentUserId: string | null }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState(ws.workspaceName);
  const [email, setEmail] = useState("");
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
      <Card label="Sample data" className="flex flex-wrap items-center justify-between gap-4 p-5">
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
      </Card>

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

          <Card label="Members" className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-1">
              <H2>Team</H2>
              <span className="text-[13px] text-muted">
                Everyone here sees the same contracts. Invite a teammate by email, then ask them to create an account with that
                email at this app&apos;s sign-in page. They join this workspace automatically.
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    {m.email}
                    {m.user_id === currentUserId && <span className="text-muted"> (you)</span>}
                  </span>
                  <span className="rounded-full bg-chip px-2.5 py-0.5 text-xs font-semibold text-ink-2 capitalize">{m.role}</span>
                </li>
              ))}
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-muted">{i.email}</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn-text">Invited</span>
                    <button
                      type="button"
                      className="min-h-9 px-2 text-xs font-semibold text-brand"
                      onClick={() => call(`/api/invites?id=${i.id}`, { method: "DELETE" }, "Invite cancelled.")}
                    >
                      Cancel
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <form
              className="flex flex-wrap gap-2.5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await call("/api/invites", { method: "POST", body: JSON.stringify({ email }) }, `Invited ${email}. Ask them to create an account with that email.`)) setEmail("");
              }}
            >
              <label htmlFor="invite" className="sr-only">Teammate email</label>
              <input
                id="invite"
                type="email"
                required
                placeholder="partner@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 min-w-[240px] flex-1 rounded-[10px] border border-[#D0D5DD] px-3 text-sm"
              />
              <button type="submit" className={btnPrimary} disabled={busy}>Invite</button>
            </form>
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
