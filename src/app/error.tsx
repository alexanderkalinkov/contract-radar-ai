"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/components/help/ErrorTrail";
import { btnGhost, btnPrimary } from "@/components/ui";

/** Shown when a page crashes while rendering. Logs the crash for the admin console. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError({ kind: "crash", message: error.message || "Page crashed", details: { digest: error.digest, stack: error.stack?.split("\n").slice(0, 6).join("\n") } });
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="m-0 font-display text-[26px] font-semibold">Something went wrong on this page</h1>
      <p className="m-0 max-w-md text-muted">It&apos;s been logged and we&apos;ll look into it. You can try again, or go back to the start.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className={btnPrimary}>Try again</button>
        <Link href="/" className={btnGhost}>Go to Outflow</Link>
      </div>
    </main>
  );
}
