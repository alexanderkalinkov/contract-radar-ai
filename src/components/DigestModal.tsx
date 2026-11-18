"use client";

import { useEffect } from "react";
import { COMPANY } from "@/lib/seed";
import { daysUntil, TODAY, addDays } from "@/lib/engine";
import { longDate, shortDate, usd } from "@/lib/format";
import type { Opportunity } from "@/lib/types";
import { IconX } from "./icons";

export function DigestModal({ onClose, opportunities }: { onClose: () => void; opportunities: Opportunity[] }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const thisMonth = opportunities
    .filter((o) => daysUntil(o.actBy) >= 0 && daysUntil(o.actBy) <= 30)
    .sort((a, b) => a.actBy.localeCompare(b.actBy));
  const top = opportunities.slice().sort((a, b) => b.annualSavings - a.annualSavings).slice(0, 3);
  const nextMonday = addDays(TODAY, 1);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(11,27,51,0.55)] p-4 sm:p-10" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Weekly digest preview"
        className="w-full max-w-[640px] rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-6 py-4">
          <div className="flex flex-col text-sm">
            <span className="font-semibold">Preview: Monday digest</span>
            <span className="text-muted">
              Sends {longDate(nextMonday)} at 8:00 AM to {COMPANY.digestRecipients.join(", ")}
            </span>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-chip">
            <IconX />
          </button>
        </div>
        <div className="flex flex-col gap-5 px-6 py-6 text-[15px] leading-relaxed text-[#1D2939]">
          <div className="text-sm">
            <span className="text-muted">Subject: </span>
            <strong>
              {usd(thisMonth.reduce((s, o) => s + o.annualSavings, 0))} at stake before {shortDate(thisMonth.at(-1)?.actBy ?? TODAY)}
            </strong>
          </div>
          <p className="m-0">Good morning. Here is what Outflow found for {COMPANY.name} this week.</p>
          <div>
            <h3 className="m-0 mb-2 font-display text-base font-semibold">Deadlines in the next 30 days</h3>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {thisMonth.map((o) => (
                <li key={o.id} className="flex justify-between gap-3 border-b border-line-soft pb-1.5">
                  <span>
                    <strong>{shortDate(o.actBy)}</strong> · {o.vendor}: {o.action.toLowerCase()}
                  </span>
                  <span className="font-semibold text-good">{usd(o.annualSavings)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="m-0 mb-2 font-display text-base font-semibold">Biggest opportunities</h3>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              {top.map((o) => (
                <li key={o.id}>
                  {o.vendor}: {o.finding} ({usd(o.annualSavings)}/yr)
                </li>
              ))}
            </ul>
          </div>
          <p className="m-0 rounded-xl bg-brand-soft p-4 text-sm text-brand-dark">
            Ready to send: the Salesforce pushback email, citing §8.2 and §4.3. Review it in one click.
          </p>
        </div>
      </div>
    </div>
  );
}
