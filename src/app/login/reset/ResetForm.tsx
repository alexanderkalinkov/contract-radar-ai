"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "../actions";
import { btnPrimary } from "@/components/ui";
import { FormAlert } from "../AuthShell";

export function ResetForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[13px] font-semibold text-ink-2">New password</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-[13px] font-semibold text-ink-2">Repeat new password</label>
        <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm" />
      </div>
      <FormAlert error={state.error} message={state.message} />
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
