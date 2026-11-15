"use client";

import Link from "next/link";
import { useState } from "react";
import { COMPANY, SOURCES } from "@/lib/seed";
import { useSources } from "@/lib/store";
import { usd } from "@/lib/format";
import type { Source } from "@/lib/types";
import { Uploader, useUploads } from "./Uploader";
import { cx, VendorLogo } from "./ui";

const DEFAULTS = Object.fromEntries(SOURCES.map((s) => [s.id, s.connected]));

export function ConnectSources({ onboarding = false }: { onboarding?: boolean }) {
  const [on, setOn] = useSources(DEFAULTS);
  const [uploads] = useUploads();
  const [pending, setPending] = useState<string | null>(null);

  const connected = (id: string) => on[id] ?? DEFAULTS[id];
  const anyId = SOURCES.some((s) => s.group === "identity" && connected(s.id));
  const anySpend = SOURCES.some((s) => s.group === "spend" && connected(s.id));
  const count = 1 + (anyId ? 1 : 0) + (anySpend ? 1 : 0);
  const found = 22_344 + (anyId ? 187_400 : 0) + (anySpend ? 96_300 : 0);

  // Stubbed OAuth: pretend to redirect and come back connected.
  const toggle = (s: Source) => {
    if (connected(s.id)) return setOn({ ...on, [s.id]: false });
    setPending(s.id);
    setTimeout(() => {
      setOn({ ...on, [s.id]: true });
      setPending(null);
    }, 900);
  };

  const groups = [
    { step: 2, group: "identity" as const, title: "Connect logins", sub: "Shows who actually uses each tool, so we can spot seats you pay for but nobody opens." },
    { step: 3, group: "spend" as const, title: "Connect spend", sub: "Finds every SaaS vendor you pay, including tools bought on a card, and flags overlaps." },
  ];

  return (
    <div className="flex flex-wrap items-start gap-7">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-[22px]">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[32px] font-semibold tracking-tight">
            {onboarding ? "Find your first savings in 10 minutes" : "Sources"}
          </h1>
          <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-muted">
            {onboarding
              ? "Start with three contracts for a free audit. Connect logins and spend when you are ready, and we will find unused seats and duplicate tools across every app."
              : "What Contract Radar reads, and when each source last synced. Connectors are simulated in this version."}
          </p>
        </div>

        <Step n={1} primary title="Upload 3 contracts, free" sub="PDF. We pull notice dates, uplift caps, seat terms and auto-renewal clauses.">
          <Uploader compact />
          {uploads.length > 0 && <span className="text-[13px] text-muted">{uploads.length} uploaded so far.</span>}
        </Step>

        {groups.map((g) => (
          <Step key={g.group} n={g.step} title={g.title} sub={g.sub}>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
              {SOURCES.filter((s) => s.group === g.group).map((s) => {
                const c = connected(s.id);
                const busy = pending === s.id;
                return (
                  <div key={s.id} className={cx("flex items-center gap-3 rounded-xl border px-3.5 py-3", c ? "border-good-line bg-[#F6FEF9]" : "border-line bg-white")}>
                    <VendorLogo initials={s.initials} hue={s.hue} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-semibold">{s.name}</span>
                      <span className="text-xs text-muted">
                        {busy ? "Connecting…" : c ? `${s.connectedSummary}${s.lastSync ? ` · synced ${s.lastSync}` : ""}` : s.what}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(s)}
                      aria-label={(c ? "Disconnect " : "Connect ") + s.name}
                      className={cx(
                        "min-h-10 flex-none rounded-[9px] border px-3.5 text-[13px] font-semibold",
                        c ? "border-good-line bg-good-soft text-good-dark" : "border-brand bg-brand text-white hover:bg-brand-dark",
                      )}
                    >
                      {busy ? "…" : c ? "Connected" : "Connect"}
                    </button>
                  </div>
                );
              })}
            </div>
          </Step>
        ))}

        <section aria-label="Step 4, weekly digest" className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-line bg-white p-[22px]">
          <StepHead n={4} title="Weekly savings digest" sub="New findings and deadlines, every Monday at 8:00 AM" />
          <div className="flex max-w-[340px] min-w-[240px] flex-[1_1_240px] flex-col gap-1.5">
            <label htmlFor="digest-to" className="text-[13px] font-semibold text-ink-2">Send to</label>
            <input
              id="digest-to"
              type="text"
              defaultValue={COMPANY.digestRecipients.join(", ")}
              className="min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm"
            />
          </div>
        </section>

        {onboarding && (
          <div className="flex flex-wrap justify-end gap-3">
            <Link href="/" className="inline-flex min-h-12 items-center rounded-[10px] bg-brand px-[22px] text-[15px] font-semibold text-white hover:bg-brand-dark">
              See my savings
            </Link>
          </div>
        )}
      </div>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        <section aria-label="What we found so far" className="flex flex-col gap-3.5 rounded-[14px] bg-navy p-[22px] text-white">
          <span className="text-xs font-bold tracking-wider text-navy-muted">FOUND SO FAR</span>
          <span className="font-display text-[38px] font-semibold tracking-tight">{usd(found)} / yr</span>
          <span className="text-[13px] leading-normal text-navy-text">
            {count === 3 ? "All three source types connected. Your full savings dashboard is ready." : "Connect the remaining sources to unlock the rest of your savings."}
          </span>
          <div className="flex flex-col gap-2.5 text-[13px]">
            {[
              { label: "Notice deadlines and price caps (contracts)", done: true },
              { label: "Unused seats (logins)", done: anyId },
              { label: "Duplicate tools (spend)", done: anySpend },
            ].map((u) => (
              <div key={u.label} className="flex items-center gap-2.5">
                <span className={cx("h-2.5 w-2.5 flex-none rounded-full", u.done ? "bg-[#32D583]" : "border-2 border-[#6A7FA3]")} />
                <span className={u.done ? "text-white" : "text-navy-muted"}>{u.label}</span>
              </div>
            ))}
          </div>
          <span className="text-xs text-navy-muted">Setup: {count} of 3 source types connected</span>
        </section>
        <section aria-label="Security" className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-white p-5">
          <h2 className="m-0 font-display text-base font-semibold">Read-only, by design</h2>
          <span className="text-[13px] leading-relaxed text-muted">
            We read sign-in dates and license counts, never email or file content. Spend data is limited to vendor, amount
            and date. Disconnect any source in one click.
          </span>
        </section>
        <section aria-label="Pricing" className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-white p-5">
          <h2 className="m-0 font-display text-base font-semibold">Priced on spend you manage</h2>
          <span className="text-[13px] leading-relaxed text-muted">
            Tiers by SaaS spend under management, from [YOUR PRICE] / month. Prefer to pay only for results? Choose a share of
            verified savings instead.
          </span>
        </section>
      </aside>
    </div>
  );
}

function StepHead({ n, title, sub, primary }: { n: number; title: string; sub: string; primary?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cx("flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-sm font-bold text-white", primary ? "bg-brand" : "bg-ink")}>
        {n}
      </span>
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 font-display text-lg font-semibold">{title}</h2>
        <span className="text-[13px] text-muted">{sub}</span>
      </div>
    </div>
  );
}

function Step({ n, title, sub, primary, children }: { n: number; title: string; sub: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={`Step ${n}, ${title}`} className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-[22px]">
      <StepHead n={n} title={title} sub={sub} primary={primary} />
      {children}
    </section>
  );
}
