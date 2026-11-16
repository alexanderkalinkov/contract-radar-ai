"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import { btnGhost, Card, H2 } from "./ui";

type Status = {
  migrated: boolean;
  enabled: boolean;
  days: number[];
  emailConfigured: boolean;
  jobConfigured: boolean;
  isAdmin: boolean;
  recent: { contract_id: string; kind: string; event_date: string; days_before: number; recipient: string; sent_at: string; contracts: { vendor: string } | null }[];
};

const KIND: Record<string, string> = { notice: "notice deadline", renewal: "renewal", term_end: "term end" };

/** Workspace settings card: renewal reminder emails on/off, setup status, sample email, recent sends. */
export function RenewalAlertSettings() {
  const ws = useWorkspace();
  const [s, setS] = useState<Status | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/alerts");
    if (res.ok) setS(await res.json());
  }, []);
  useEffect(() => {
    if (ws.mode !== "demo") load();
  }, [ws.mode, load]);

  async function call(init: RequestInit, ok: (j: { to?: string }) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/alerts", { ...init, headers: { "content-type": "application/json" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setMsg({ ok: true, text: ok(json) });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const days = s?.days ?? [90, 60, 30];
  const schedule = days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}` : String(days[0]);

  return (
    <Card label="Renewal reminders" className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[520px] flex-col gap-1">
          <H2>Renewal reminders</H2>
          <span className="text-[13px] text-muted">
            We email the department owner and every admin {schedule} days before each notice deadline and renewal date
            found in your uploaded contracts. One email a day at most, sent around 7:00 UTC.
          </span>
        </div>
        {ws.mode !== "demo" && s && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#1D4ED8]"
              checked={s.enabled}
              disabled={busy || !s.isAdmin || !s.migrated}
              onChange={(e) =>
                call({ method: "PATCH", body: JSON.stringify({ enabled: e.target.checked }) }, () =>
                  e.target.checked ? "Reminders are on." : "Reminders are off for this workspace.",
                )
              }
            />
            {s.enabled ? "On" : "Off"}
          </label>
        )}
      </div>

      {ws.mode === "demo" ? (
        <p className="m-0 text-sm text-ink-2">Reminders need a shared workspace (Supabase). In demo mode nothing is emailed.</p>
      ) : s ? (
        <>
          {(!s.migrated || !s.emailConfigured || !s.jobConfigured) && (
            <div className="rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3 text-[13px] text-warn-text">
              <strong>Setup needed before reminders can go out:</strong>
              <ul className="m-0 mt-1 list-disc pl-5">
                {!s.migrated && <li>Run supabase/migrations/20261116120000_renewal_alerts.sql in the Supabase SQL editor.</li>}
                {!s.emailConfigured && <li>Add RESEND_API_KEY and EMAIL_FROM to the environment.</li>}
                {!s.jobConfigured && <li>Add CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY to the environment.</li>}
              </ul>
              <span className="mt-1 block">Step by step: docs/email-setup.md.</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className={btnGhost}
              disabled={busy || !s.emailConfigured}
              onClick={() => call({ method: "POST" }, (j) => `Sample reminder sent to ${j.to}. Check your inbox.`)}
            >
              Email me a sample reminder
            </button>
            <a className="text-sm font-semibold text-brand" href="/api/email-preview?t=renewal-digest" target="_blank" rel="noreferrer">
              Preview in browser
            </a>
          </div>
          {s.recent.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold tracking-wider text-muted uppercase">Recently sent</span>
              {s.recent.map((r) => (
                <span key={`${r.contract_id}${r.kind}${r.days_before}${r.recipient}`} className="text-[13px] text-ink-2">
                  {r.contracts?.vendor ?? "Contract"} {KIND[r.kind] ?? r.kind}, {r.days_before}-day reminder to {r.recipient} ·{" "}
                  <span className="text-muted">{new Date(r.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <span className="text-sm text-muted">Loading…</span>
      )}
      {msg && <p className={msg.ok ? "m-0 text-sm text-good" : "m-0 text-sm text-urgent"} role="status">{msg.text}</p>}
    </Card>
  );
}
