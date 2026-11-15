"use client";

import Link from "next/link";
import { useWorkspace } from "./WorkspaceProvider";

/** Reminds people which rows are sample data, with a switch to hide them. */
export function SampleDataNote() {
  const ws = useWorkspace();
  if (!ws.showSample) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px] text-muted">
      <span>
        Sample data for the fictional Northwind Logistics is shown alongside your own contracts.
      </span>
      <span className="flex gap-3">
        <button type="button" onClick={() => ws.setShowSample(false)} className="min-h-9 font-semibold text-brand hover:underline">
          Hide sample data
        </button>
        <Link href="/settings" className="flex min-h-9 items-center font-semibold text-brand hover:underline">
          Settings
        </Link>
      </span>
    </div>
  );
}
