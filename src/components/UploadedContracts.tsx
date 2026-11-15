"use client";

import { useState } from "react";
import { daysUntil } from "@/lib/engine";
import { shortDate, usd } from "@/lib/format";
import { useUploads, ExtractionCard } from "./Uploader";
import { Card, DaysBadge, H2 } from "./ui";

export function UploadedContracts() {
  const [uploads, setUploads] = useUploads();
  const [open, setOpen] = useState<string | null>(null);
  if (uploads.length === 0) return null;
  return (
    <Card label="Uploaded by you" className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2>Uploaded by you</H2>
        <button type="button" onClick={() => setUploads([])} className="text-[13px] font-semibold text-brand">
          Clear
        </button>
      </div>
      {uploads.map((u) => (
        <div key={u.fileName} className="flex flex-col gap-3 rounded-xl border border-line-soft px-4 py-3">
          <button
            type="button"
            aria-expanded={open === u.fileName}
            onClick={() => setOpen(open === u.fileName ? null : u.fileName)}
            className="flex flex-wrap items-center gap-3 text-left"
          >
            <div className="flex min-w-[200px] flex-1 flex-col">
              <span className="font-semibold">{u.data.vendor}</span>
              <span className="text-[13px] text-muted">
                {u.fileName}
                {u.demo ? " · demo result" : ""}
              </span>
            </div>
            <span className="text-sm">{u.data.annual_fee.value != null ? usd(u.data.annual_fee.value) + " / yr" : ""}</span>
            <span className="text-sm">{u.data.uplift_cap_percent.value != null ? `${u.data.uplift_cap_percent.value}% cap` : "No cap"}</span>
            {u.noticeDeadline && (
              <span className="flex items-center gap-2 text-sm font-medium">
                Notice {shortDate(u.noticeDeadline)} <DaysBadge days={daysUntil(u.noticeDeadline)} />
              </span>
            )}
          </button>
          {open === u.fileName && <ExtractionCard r={u} />}
        </div>
      ))}
    </Card>
  );
}
