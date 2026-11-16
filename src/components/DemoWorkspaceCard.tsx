"use client";

import { useState } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import { btnGhost, btnPrimary, Card, H2 } from "./ui";

/** Moves to another workspace and reloads, so every page and cache picks up the new data. */
export async function switchWorkspace(id: string): Promise<string | null> {
  const res = await fetch("/api/workspace/switch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return json.error ?? "Couldn't switch workspace.";
  window.location.assign("/");
  return null;
}

/** Workspace settings: create, open, reset or leave the demo workspace used on sales calls. */
export function DemoWorkspaceCard() {
  const ws = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (ws.mode !== "cloud") return null;

  const demo = ws.workspaces?.find((w) => w.is_demo);
  const real = ws.workspaces?.find((w) => !w.is_demo);

  async function demoOp(op: "create" | "reset") {
    setBusy(op);
    setMsg(null);
    try {
      const res = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Something went wrong.");
      setMsg({ ok: true, text: op === "reset" ? "Demo data reset. Reloading…" : "Demo workspace ready. Opening it…" });
      window.location.assign(op === "reset" ? window.location.pathname : "/");
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      setBusy(null);
    }
  }

  async function go(id: string) {
    setBusy("switch");
    const err = await switchWorkspace(id);
    if (err) {
      setMsg({ ok: false, text: err });
      setBusy(null);
    }
  }

  return (
    <Card label="Demo workspace" className="flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <H2>Demo workspace for sales calls</H2>
        {ws.isDemo ? (
          <span className="text-[13px] text-muted">
            You&apos;re in the demo workspace: the fictional Northwind Logistics, with 11 contracts, 15 tools, 6 departments,
            survey answers and connected sources. Reminder emails are off here. Reset it after each call to undo whatever you
            clicked, uploaded or invited. Dates move with today, so deadlines always look current.
          </span>
        ) : (
          <span className="text-[13px] text-muted">
            A separate workspace filled with a realistic, fictional company (Northwind Logistics): contracts with notice
            deadlines and price caps, departments and their owners, survey answers, savings and upcoming renewals. Show it on
            calls instead of your own data, and reset it with one click. Your workspace isn&apos;t touched.
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {ws.isDemo ? (
          <>
            <button
              type="button"
              className={btnPrimary}
              disabled={Boolean(busy)}
              onClick={() => {
                if (window.confirm("Reset the demo workspace? Everything in it is deleted and filled again with the starting demo data.")) demoOp("reset");
              }}
            >
              {busy === "reset" ? "Resetting…" : "Reset demo data"}
            </button>
            {real && (
              <button type="button" className={btnGhost} disabled={Boolean(busy)} onClick={() => go(real.id)}>
                Back to {real.name}
              </button>
            )}
          </>
        ) : demo ? (
          <button type="button" className={btnPrimary} disabled={Boolean(busy)} onClick={() => go(demo.id)}>
            {busy ? "Opening…" : "Open demo workspace"}
          </button>
        ) : (
          <button type="button" className={btnPrimary} disabled={Boolean(busy)} onClick={() => demoOp("create")}>
            {busy === "create" ? "Creating…" : "Create demo workspace"}
          </button>
        )}
      </div>
      {msg && (
        <p role="status" className={msg.ok ? "m-0 text-sm text-good-dark" : "m-0 text-sm text-[#912018]"}>
          {msg.text}
        </p>
      )}
    </Card>
  );
}
