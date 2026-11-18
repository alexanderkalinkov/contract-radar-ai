"use client";

import { useCallback, useEffect, useState } from "react";
import { btnGhost, btnPrimary, Card, H2 } from "@/components/ui";
import { inputCls, labelCls, Notice } from "@/components/team/forms";
import type { SsoData } from "@/lib/enterprise/types";
import { ROLES } from "@/lib/roles";
import { useWorkspace } from "../WorkspaceProvider";

const STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "Waiting for activation", cls: "bg-warn-soft text-warn-text" },
  active: { label: "Active", cls: "bg-good-soft text-good-dark" },
  disabled: { label: "Disabled", cls: "bg-chip text-ink-2" },
};
const JIT_ROLES = ROLES.filter((r) => r.value !== "owner");

function Copy({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className={labelCls}>{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-chip px-3 py-2 text-[12px]">{value}</code>
        <button
          type="button"
          className="min-h-9 px-1 text-xs font-semibold text-brand"
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => undefined);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
        >
          {done ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** Workspace settings (admins): request SAML SSO for the company domain, then require it and pick the role new people get. */
export function SsoCard() {
  const ws = useWorkspace();
  const [d, setD] = useState<SsoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [domain, setDomain] = useState(ws.email?.split("@")[1] ?? "");
  const [meta, setMeta] = useState("");
  const [role, setRole] = useState("member");

  const load = useCallback(async () => {
    const res = await fetch("/api/sso");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? "Could not load SSO settings.");
    setError(null);
    setD(json);
  }, []);
  useEffect(() => {
    if (ws.mode === "cloud" && ws.role === "owner") load();
  }, [ws.mode, ws.role, load]);

  if (ws.mode !== "cloud" || ws.role !== "owner") return null;

  async function post(body: object, ok: string) {
    const res = await fetch("/api/sso", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({ ok: false }));
    setMsg(json.ok ? { ok: true, text: ok } : { ok: false, text: json.error ?? "Something went wrong." });
    if (json.ok) await load();
    return Boolean(json.ok);
  }

  return (
    <Card label="Single sign-on" className="flex flex-col gap-4 p-5">
      <div className="flex max-w-[600px] flex-col gap-1">
        <H2>Single sign-on (SAML)</H2>
        <span className="text-[13px] text-muted">
          Let people sign in with your company account: Okta, Microsoft Entra ID, Google Workspace or any SAML 2.0 provider. Anyone who
          signs in through it joins this workspace automatically with the role you choose.
        </span>
      </div>

      {error ? (
        <p className="m-0 rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3 text-[13px] text-warn-text">{error}</p>
      ) : !d ? (
        <p className="m-0 text-sm text-muted">Loading…</p>
      ) : (
        <>
          {!d.enabled && (
            <p className="m-0 rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3 text-[13px] text-warn-text">
              SSO isn&apos;t switched on for Outflow yet. You can still send your request now; we activate it once your identity provider is ready.
            </p>
          )}
          {d.serviceProvider && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-line-soft p-4">
              <span className="text-sm font-semibold">1. Add Outflow as an app in your identity provider</span>
              <Copy label="Entity ID (Audience URI)" value={d.serviceProvider.entityId} />
              <Copy label="ACS URL (Reply / Single sign-on URL)" value={d.serviceProvider.acsUrl} />
              <span className="text-[13px] text-muted">Name ID format: email address. Send the user&apos;s email as the NameID.</span>
            </div>
          )}

          {d.configs.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-line-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">@{c.domain}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
              </div>
              {c.status === "requested" && (
                <span className="text-[13px] text-ink-2">We check the domain is yours and switch it on, usually within one working day.</span>
              )}
              <span className="break-all text-[13px] text-muted">Metadata: {c.metadata_url}</span>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  New people join as
                  <select className={`${inputCls} w-auto`} value={c.default_role} onChange={(e) => post({ op: "update", id: c.id, default_role: e.target.value }, "Saved.")}>
                    {JIT_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[#1D4ED8]"
                    checked={c.enforce}
                    disabled={c.status !== "active"}
                    onChange={(e) =>
                      post(
                        { op: "update", id: c.id, enforce: e.target.checked },
                        e.target.checked ? `Everyone at ${c.domain} now has to sign in with SSO.` : "Passwords work again.",
                      )
                    }
                  />
                  Require SSO for everyone at @{c.domain}
                </label>
              </div>
              <button
                type="button"
                className={`${btnGhost} self-start text-[#912018]`}
                onClick={async () => {
                  if (!window.confirm(`Remove SSO for ${c.domain}? People go back to email and password.`)) return;
                  await post({ op: "remove", id: c.id }, "SSO removed.");
                }}
              >
                Remove
              </button>
            </div>
          ))}

          {d.configs.length === 0 && (
            <form
              className="flex flex-col gap-3 rounded-xl border border-line-soft p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await post({ op: "request", domain, metadata_url: meta, default_role: role }, "Request sent. We'll email you when SSO is live.")) setMeta("");
              }}
            >
              <span className="text-sm font-semibold">2. Send us your identity provider&apos;s details</span>
              <div className="flex flex-wrap gap-2.5">
                <div className="flex min-w-[160px] flex-1 flex-col gap-1">
                  <label htmlFor="sso-domain" className={labelCls}>Email domain</label>
                  <input id="sso-domain" className={inputCls} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
                </div>
                <div className="flex min-w-[160px] flex-1 flex-col gap-1">
                  <label htmlFor="sso-role" className={labelCls}>New people join as</label>
                  <select id="sso-role" className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
                    {JIT_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="sso-meta" className={labelCls}>SAML metadata URL</label>
                <input id="sso-meta" className={inputCls} value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="https://acme.okta.com/app/…/sso/saml/metadata" />
              </div>
              <button type="submit" className={`${btnPrimary} self-start`} disabled={!domain.trim() || !meta.trim()}>
                Request SSO
              </button>
            </form>
          )}
        </>
      )}
      <Notice msg={msg} />
    </Card>
  );
}
