"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { btnPrimary } from "@/components/ui";
import { SUPPORT_ATTACHMENT_MAX, SUPPORT_ATTACHMENT_TYPES, SUPPORT_TOPICS } from "@/lib/help";
import { readErrorTrail } from "./ErrorTrail";

const field = "min-h-11 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm";
const label = "text-[13px] font-semibold text-ink-2";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; receipt: boolean } | { kind: "error"; message: string };

/** "Contact support": emails the team with who sent it, which workspace and page, and recent errors. */
export function SupportForm({ fromPage, topic }: { fromPage?: string; topic?: string }) {
  const ws = useWorkspace();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [fileError, setFileError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("attachment");
    if (file instanceof File && file.size === 0) data.delete("attachment");
    data.set("page", fromPage || "");
    data.set("errors", JSON.stringify(readErrorTrail()));
    data.set("browser", `${navigator.userAgent} · ${window.innerWidth}x${window.innerHeight} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/support", { method: "POST", body: data });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; receipt?: boolean };
      if (!res.ok || !json.ok) {
        setState({ kind: "error", message: json.error ?? "We couldn't send that. Please try again in a minute." });
        return;
      }
      form.reset();
      setState({ kind: "sent", receipt: Boolean(json.receipt) });
    } catch {
      setState({ kind: "error", message: "We couldn't reach the server. Check your connection and try again." });
    }
  }

  if (state.kind === "sent") {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-xl border border-good-line bg-good-soft p-5 text-good-dark">
        <strong className="text-[15px]">Thanks, we got it.</strong>
        <span className="text-sm">
          We read every message and usually reply within one business day{state.receipt ? `. A copy is on its way to ${ws.email}` : ""}.
        </span>
        <button type="button" onClick={() => setState({ kind: "idle" })} className="w-fit text-sm font-semibold underline">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {ws.mode === "demo" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="support-email" className={label}>Your email</label>
          <input id="support-email" name="email" type="email" required autoComplete="email" className={field} placeholder="name@company.com" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="support-topic" className={label}>What&apos;s it about?</label>
        <select id="support-topic" name="topic" defaultValue={SUPPORT_TOPICS.some((t) => t.value === topic) ? topic : "bug"} className={field}>
          {SUPPORT_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="support-message" className={label}>Tell us what happened</label>
        <textarea
          id="support-message"
          name="message"
          required
          minLength={5}
          maxLength={5000}
          rows={6}
          className="w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 py-2.5 text-sm"
          placeholder="What were you trying to do, and what did you see instead?"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="support-file" className={label}>Screenshot (optional)</label>
        <input
          id="support-file"
          name="attachment"
          type="file"
          accept={SUPPORT_ATTACHMENT_TYPES.join(",")}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f && f.size > SUPPORT_ATTACHMENT_MAX) {
              setFileError("That file is over 3 MB. Try a smaller screenshot.");
              e.currentTarget.value = "";
            } else setFileError(null);
          }}
          className="text-sm file:mr-3 file:min-h-10 file:rounded-[9px] file:border file:border-brand-line file:bg-brand-soft file:px-3.5 file:text-[13px] file:font-semibold file:text-brand-dark"
        />
        {fileError && <span role="alert" className="text-sm text-[#912018]">{fileError}</span>}
        <span className="text-xs text-muted">PNG, JPG or PDF up to 3 MB.</span>
      </div>
      <p className="m-0 text-xs text-muted">
        So we can fix things fast, your message includes your email, workspace, the page you came from, your browser and any recent errors on this tab. No contract contents are sent.
      </p>
      {state.kind === "error" && <p role="alert" className="m-0 rounded-lg bg-[#FEF3F2] px-3 py-2 text-sm text-[#912018]">{state.message}</p>}
      <button type="submit" disabled={state.kind === "sending"} className={`${btnPrimary} w-fit`}>
        {state.kind === "sending" ? "Sending…" : "Send to support"}
      </button>
    </form>
  );
}
