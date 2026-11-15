"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Logo } from "@/components/icons";
import { btnGhost, btnPrimary, Card, H2 } from "@/components/ui";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Invite and sign-in links (implicit flow) land here with tokens in the URL hash.
// We store the session in cookies, then offer to set a password for next time.
function client() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY, { auth: { detectSessionInUrl: false }, isSingleton: false });
}

function safeNext(): string {
  const n = new URLSearchParams(window.location.search).get("next") ?? "/tools";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/tools";
}

export default function ConfirmPage() {
  const [state, setState] = useState<"working" | "ready" | "error">("working");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [next, setNext] = useState("/tools");

  useEffect(() => {
    setNext(safeNext());
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const err = hash.get("error_description") ?? new URLSearchParams(window.location.search).get("error_description");
    history.replaceState(null, "", window.location.pathname + window.location.search);
    if (err) {
      setError(err.replace(/\+/g, " "));
      setState("error");
      return;
    }
    if (!access_token || !refresh_token) {
      setError("This link has no sign-in details. It may have been opened already.");
      setState("error");
      return;
    }
    client()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error: e }) => {
        if (e) {
          setError(e.message);
          setState("error");
        } else setState("ready");
      });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-10">
      <span className="flex items-center gap-2.5 text-ink">
        <Logo />
        <span className="font-display text-lg font-bold">Contract Radar</span>
      </span>
      <Card label="Sign in" className="flex w-full max-w-[440px] flex-col gap-4 p-6">
        {state === "working" && <p className="m-0 text-sm text-muted">Signing you in…</p>}
        {state === "error" && (
          <>
            <H2>That link didn&apos;t work</H2>
            <p className="m-0 text-sm text-ink-2">{error}</p>
            <p className="m-0 text-sm text-ink-2">
              Ask for a new invite, or create an account with the email you were invited with.
            </p>
            <Link href="/login?mode=signup" className={btnPrimary}>Create account</Link>
          </>
        )}
        {state === "ready" && (
          <>
            <H2>You&apos;re in</H2>
            <p className="m-0 text-sm text-ink-2">Set a password so you can sign in next time without an email link.</p>
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                const { error: e2 } = await client().auth.updateUser({ password });
                setSaving(false);
                if (e2) setError(e2.message);
                else window.location.assign(next);
              }}
            >
              <label htmlFor="pw" className="text-[13px] font-semibold text-ink-2">Password (8+ characters)</label>
              <input id="pw" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-11 rounded-[10px] border border-[#D0D5DD] px-3 text-sm" />
              {error && <p className="m-0 text-sm text-[#912018]">{error}</p>}
              <button type="submit" className={btnPrimary} disabled={saving}>{saving ? "Saving…" : "Save and continue"}</button>
              <button type="button" className={btnGhost} onClick={() => window.location.assign(next)}>Skip for now</button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
