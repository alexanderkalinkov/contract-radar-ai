"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { authenticate, type AuthState } from "./actions";
import { btnPrimary, cx } from "@/components/ui";
import { FormAlert } from "./AuthShell";

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
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="text-[13px] font-semibold text-ink-2">Password</label>
          {mode === "signin" && (
            <Link href="/login/forgot" className="text-[13px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
              Forgot password?
            </Link>
          )}
        </div>
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
      <FormAlert error={state.error} message={state.message} />
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
