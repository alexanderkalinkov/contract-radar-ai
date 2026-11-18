"use client";

import { useActionState } from "react";
import { btnPrimary } from "@/components/ui";
import { verifyMfaSignIn, type AuthState } from "../actions";
import { FormAlert } from "../AuthShell";

export function MfaForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(verifyMfaSignIn, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="code" className="text-[13px] font-semibold text-ink-2">6-digit code</label>
        <input
          id="code"
          name="code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          placeholder="123 456"
          className="min-h-12 rounded-[10px] border border-[#D0D5DD] px-3 text-center font-mono text-xl tracking-[0.3em]"
        />
      </div>
      <FormAlert error={state.error} />
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Checking…" : "Continue"}</button>
    </form>
  );
}
