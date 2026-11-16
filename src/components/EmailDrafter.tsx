"use client";

import { useState } from "react";
import type { EmailGoal } from "@/lib/opportunities";
import type { SavedContract } from "@/lib/saved";
import { btnGhost, btnPrimary, Card, H2, Segmented } from "./ui";

const GOALS: { value: EmailGoal; label: string }[] = [
  { value: "cap", label: "Ask for a cap" },
  { value: "seats", label: "Cut seats" },
  { value: "review", label: "Renegotiate" },
  { value: "cancel", label: "Cancel" },
];

type Draft = { subject: string; body: string; demo: boolean };

/** Sign-in facts for a seat-cut email: paid seats, how many were used, and the count to ask for. */
export interface SeatFacts {
  paid: number;
  active: number;
  target: number | null;
  source: string;
  days: number;
}

export function EmailDrafter({ contract, defaultGoal, seats }: { contract: SavedContract; defaultGoal: EmailGoal; seats?: SeatFacts }) {
  const [goal, setGoal] = useState<EmailGoal>(defaultGoal);
  const [tone, setTone] = useState<"firm" | "friendly">("friendly");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setErr(null);
    setCopied(false);
    try {
      const res = await fetch("/api/draft-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: contract.data,
          noticeDeadline: contract.noticeDeadline,
          goal,
          tone,
          seats: seats ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Drafting failed (${res.status})`);
      setDraft(json as Draft);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const mailto = draft ? `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}` : "";

  return (
    <Card label="Pushback email" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <H2>Pushback email</H2>
        <span className="text-[13px] text-muted">
          Claude writes it from this contract&apos;s own clauses and dates. Read it over and edit before you send it.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="What the email asks for" options={GOALS} value={goal} onChange={setGoal} />
        <Segmented
          label="Tone"
          options={[
            { value: "friendly", label: "Friendly" },
            { value: "firm", label: "Firm" },
          ]}
          value={tone}
          onChange={setTone}
        />
        <button type="button" className={btnPrimary} onClick={generate} disabled={busy}>
          {busy ? "Drafting…" : draft ? "Redraft" : "Draft with Claude"}
        </button>
      </div>
      {err && (
        <p role="alert" className="m-0 text-sm text-[#912018]">
          {err}
        </p>
      )}
      {draft && (
        <div className="flex flex-col gap-3">
          {draft.demo && (
            <p className="m-0 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn-text">
              Template email: no ANTHROPIC_API_KEY is set, so Claude didn&apos;t write this one.
            </p>
          )}
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-2">
            Subject
            <input
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              className="min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm font-normal text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-2">
            Email
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={12}
              className="rounded-[10px] border border-[#D0D5DD] p-3 font-sans text-sm leading-relaxed font-normal text-ink"
            />
          </label>
          <div className="flex flex-wrap gap-2.5">
            <a href={mailto} className={btnPrimary}>
              Open in email
            </a>
            <button
              type="button"
              className={btnGhost}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
                  setCopied(true);
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
