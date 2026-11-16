"use client";

import { useCallback, useEffect, useState } from "react";
import type { InboxInfo } from "@/app/api/inbound/route";
import { useWorkspace } from "./WorkspaceProvider";
import { btnGhost, btnPrimary, Card, cx, H2 } from "./ui";

const STATUS: Record<string, { label: string; cls: string }> = {
  processing: { label: "Reading", cls: "text-muted" },
  done: { label: "Added", cls: "text-[#067647]" },
  partial: { label: "Partly added", cls: "text-[#93370D]" },
  rejected: { label: "Not accepted", cls: "text-[#912018]" },
  failed: { label: "Failed", cls: "text-[#912018]" },
};

function useInbox() {
  const ws = useWorkspace();
  const [info, setInfo] = useState<InboxInfo | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/inbound").catch(() => null);
    if (res?.ok) setInfo(await res.json());
  }, []);
  useEffect(() => {
    if (ws.mode === "cloud") load();
  }, [ws.mode, load]);
  return { ws, info, load };
}

function CopyButton({ text, primary }: { text: string; primary?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={primary ? btnPrimary : btnGhost}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked: the address is selectable */
        }
      }}
    >
      {done ? "Copied" : "Copy address"}
    </button>
  );
}

/** Workspace settings: the workspace's contract inbox address, setup status and recent emails. */
export function EmailInboxCard() {
  const { ws, info, load } = useInbox();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (ws.mode !== "cloud") return null;

  async function rotate() {
    if (!window.confirm("Make a new inbox address? The current one stops working right away, so anyone who saved it will need the new one.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/inbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "rotate" }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setMsg({ ok: true, text: "New address ready. The old one no longer works." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card label="Contract inbox" className="flex flex-col gap-4 p-5">
      <div className="flex max-w-[560px] flex-col gap-1">
        <H2>Email contracts in</H2>
        <span className="text-[13px] text-muted">
          Forward a vendor&apos;s email, or send a PDF or Word contract, to your workspace&apos;s own address. Claude reads each
          attachment like an upload, files the tool under the sender&apos;s department, and replies with what it found. Only
          people in this workspace can send to it.
        </span>
      </div>

      {!info ? (
        <span className="text-sm text-muted">Loading…</span>
      ) : !info.ready || !info.configured ? (
        <div className="rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3 text-[13px] text-warn-text">
          <strong>Setup needed before the inbox works:</strong>
          <ul className="m-0 mt-1 list-disc pl-5">
            {!info.ready && <li>Run supabase/migrations/20261116200000_email_inbox.sql in the Supabase SQL editor.</li>}
            {!info.configured && <li>Turn on receiving in Resend, then add INBOUND_EMAIL_DOMAIN and RESEND_WEBHOOK_SECRET to the environment.</li>}
          </ul>
          <span className="mt-1 block">Step by step: docs/email-inbox-setup.md.</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <code className="min-h-11 flex-1 rounded-[10px] border border-line bg-chip px-3 py-2.5 font-mono text-[14px] break-all select-all">
              {info.address}
            </code>
            <CopyButton text={info.address!} primary />
          </div>
          <span className="text-[13px] text-muted">
            Tip: save it as a contact called &quot;Contract Radar&quot; so anyone on the team can forward renewals in two clicks.
          </span>
          {info.canRotate && (
            <div>
              <button type="button" className={btnGhost} disabled={busy} onClick={rotate}>
                {busy ? "Making a new address…" : "Get a new address"}
              </button>
            </div>
          )}
        </>
      )}

      {msg && (
        <p role="status" className={cx("m-0 text-sm", msg.ok ? "text-[#067647]" : "text-[#912018]")}>
          {msg.text}
        </p>
      )}

      {info && info.recent.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-wider text-muted uppercase">Recently received</span>
          {info.recent.map((r) => {
            const s = STATUS[r.status] ?? { label: r.status, cls: "text-muted" };
            return (
              <span key={r.id} className="text-[13px] text-ink-2">
                <span className={cx("font-semibold", s.cls)}>{s.label}</span> · {r.subject || "(no subject)"} from {r.from_email ?? "unknown"} ·{" "}
                <span className="text-muted">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                {r.detail && r.status !== "done" && <span className="block text-muted">{r.detail}</span>}
              </span>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** One line under the uploader: "Or email contracts to …". Shows nothing until the inbox is set up. */
export function InboxHint() {
  const { ws, info } = useInbox();
  if (ws.mode !== "cloud" || !info?.ready || !info.configured || !info.address) return null;
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
      Or email PDF and Word contracts to <code className="font-mono text-[13px] break-all select-all">{info.address}</code>
      <a href="/settings" className="font-semibold text-brand">
        About the inbox
      </a>
    </p>
  );
}
