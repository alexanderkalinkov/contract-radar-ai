"use client";

import { useActionState } from "react";
import { btnPrimary } from "@/components/ui";
import { startSso, type AuthState } from "../actions";
import { FormAlert } from "../AuthShell";

export function SsoForm({ defaultEmail, next }: { defaultEmail: string; next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(startSso, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sso-email" className="text-[13px] font-semibold text-ink-2">Work email</label>
        <input
          id="sso-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail}
          className="min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm"
        />
      </div>
      <FormAlert error={state.error} />
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Redirecting…" : "Continue with SSO"}
      </button>
    </form>
  );
}
