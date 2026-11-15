"use client";

import { useActionState, useState } from "react";
import { authenticate, type AuthState } from "./actions";
import { btnPrimary, cx } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="intent" value={mode} />
      <div role="tablist" aria-label="Sign in or create account" className="flex gap-0.5 rounded-[10px] bg-chip p-[3px]">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cx("min-h-10 flex-1 rounded-lg text-sm font-semibold", mode === m ? "bg-white text-ink shadow-sm" : "text-muted")}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13px] font-semibold text-ink-2">Work email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[13px] font-semibold text-ink-2">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className="min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm"
        />
      </div>
      {state.error && <p role="alert" className="m-0 rounded-lg bg-[#FEF3F2] px-3 py-2 text-sm text-[#912018]">{state.error}</p>}
      {state.message && <p role="status" className="m-0 rounded-lg bg-good-soft px-3 py-2 text-sm text-good-dark">{state.message}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      {mode === "signup" && (
        <p className="m-0 text-xs text-muted">
          Invited by a teammate? Sign up with the email they invited and you&apos;ll join their workspace automatically.
        </p>
      )}
    </form>
  );
}
