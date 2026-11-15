"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "../actions";
import { btnPrimary } from "@/components/ui";
import { FormAlert } from "../AuthShell";

export function ForgotForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13px] font-semibold text-ink-2">Work email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail}
          className="min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm"
        />
      </div>
      <FormAlert error={state.error} message={state.message} />
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/login" className="text-center text-sm font-semibold text-muted hover:text-ink">
        Back to sign in
      </Link>
    </form>
  );
}
