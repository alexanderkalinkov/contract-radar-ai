"use client";

import Link from "next/link";
import { COMPANY } from "@/lib/seed";
import { daysUntil, noticeDeadline } from "@/lib/engine";
import { shortDate, usd } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio";
import { isRisky } from "@/lib/saved";
import { reviewProgress } from "@/lib/review";
import { btnGhost, btnPrimary, Card, DaysBadge, PageHeader, VendorLogo } from "@/components/ui";
import { IconUpload } from "@/components/icons";
import { SampleDataNote } from "@/components/SampleDataNote";

export default function ContractsPage() {
  const { contracts, saved, showSample, totals, loading } = usePortfolio();
  const rows = contracts.slice().sort((a, b) => {
    const da = noticeDeadline(a) || "9999";
    const db = noticeDeadline(b) || "9999";
    return da.localeCompare(db);
  });
  const savedById = Object.fromEntries(saved.map((s) => [s.id, s]));

  return (
    <>
      <PageHeader
        eyebrow={
          showSample
            ? `${totals.contractsTracked} of ${COMPANY.appsDetected + saved.length} apps have a contract on file · ${saved.length} uploaded by your team`
            : `${saved.length} contract${saved.length === 1 ? "" : "s"} uploaded by your team`
        }
        title="Contracts"
      >
        <Link href="/upload" className={btnPrimary}>
          <IconUpload /> Upload contract
        </Link>
        <Link href="/import" className={btnGhost}>
          Bulk import
        </Link>
      </PageHeader>

      <SampleDataNote />

      <Card label="Contracts" className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <th scope="col" className="px-5 py-3 font-semibold">Vendor</th>
              <th scope="col" className="px-3 py-3 font-semibold">Owner</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Annual fee</th>
              <th scope="col" className="px-3 py-3 font-semibold">Uplift cap</th>
              <th scope="col" className="px-3 py-3 font-semibold">Auto-renew</th>
              <th scope="col" className="px-5 py-3 font-semibold">Notice deadline</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-5 py-6 text-muted">Loading your team&apos;s contracts…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted">
                  No contracts yet. <Link href="/upload" className="font-semibold text-brand">Upload your first one</Link> and Claude
                  will pull out the notice date, renewal terms and price cap.
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const notice = noticeDeadline(c);
              const s = savedById[c.id];
              const flags = s ? isRisky(s) : [];
              const reviewed = s ? reviewProgress(s.data) : null;
              return (
                <tr key={c.id} className="border-t border-line-soft hover:bg-[#F8FAFC]">
                  <td className="px-5 py-3.5">
                    <Link href={`/contracts/${c.id}`} className="flex items-center gap-3 text-ink">
                      <VendorLogo initials={c.initials} hue={c.hue} />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold">
                          {c.vendor} {c.product}
                          {c.uploaded && (
                            <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">Uploaded</span>
                          )}
                          {reviewed &&
                            (reviewed.reviewed === reviewed.total ? (
                              <span className="ml-2 rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good-dark">Terms reviewed</span>
                            ) : (
                              <span className="ml-2 rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-muted">
                                {reviewed.reviewed}/{reviewed.total} terms reviewed
                              </span>
                            ))}
                          {!c.uploaded && (
                            <span className="ml-2 rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-muted">Sample</span>
                          )}
                        </span>
                        <span className="text-[13px] text-muted">
                          {c.uploaded ? s?.fileName : `${c.category} · ${c.documents.join(" + ")}`}
                        </span>
                        {flags.length > 0 && <span className="text-xs font-semibold text-warn">{flags[0]}</span>}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3.5 text-ink-2">{c.owner}</td>
                  <td className="px-3 py-3.5 text-right font-semibold">{c.annualFee ? usd(c.annualFee) : "—"}</td>
                  <td className="px-3 py-3.5">
                    {c.upliftCapPct != null ? `${c.upliftCapPct}%` : <span className="font-medium text-warn">None found</span>}
                  </td>
                  <td className="px-3 py-3.5">{c.autoRenew ? `Yes · ${c.noticeDays}-day notice` : "No"}</td>
                  <td className="px-5 py-3.5">
                    {notice ? (
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{shortDate(notice)}</span>
                        <DaysBadge days={daysUntil(notice)} />
                      </div>
                    ) : (
                      <span className="text-muted">Not found</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
