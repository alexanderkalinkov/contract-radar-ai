import Link from "next/link";
import { CONTRACTS, PORTFOLIO, COMPANY } from "@/lib/seed";
import { daysUntil, noticeDeadline } from "@/lib/engine";
import { shortDate, usd } from "@/lib/format";
import { btnPrimary, Card, DaysBadge, PageHeader, VendorLogo } from "@/components/ui";
import { IconUpload } from "@/components/icons";
import { UploadedContracts } from "@/components/UploadedContracts";

export default function ContractsPage() {
  const rows = CONTRACTS.slice().sort((a, b) => noticeDeadline(a).localeCompare(noticeDeadline(b)));
  return (
    <>
      <PageHeader
        eyebrow={`${PORTFOLIO.contractsTracked} of ${COMPANY.appsDetected} apps have a contract on file · sample shows ${CONTRACTS.length}`}
        title="Contracts"
      >
        <Link href="/upload" className={btnPrimary}>
          <IconUpload /> Upload contract
        </Link>
      </PageHeader>

      <UploadedContracts />

      <Card label="Contracts" className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
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
            {rows.map((c) => {
              const notice = noticeDeadline(c);
              return (
                <tr key={c.id} className="border-t border-line-soft hover:bg-[#F8FAFC]">
                  <td className="px-5 py-3.5">
                    <Link href={`/contracts/${c.id}`} className="flex items-center gap-3 text-ink">
                      <VendorLogo initials={c.initials} hue={c.hue} />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold">{c.vendor} {c.product}</span>
                        <span className="text-[13px] text-muted">{c.category} · {c.documents.join(" + ")}</span>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3.5 text-ink-2">{c.owner}</td>
                  <td className="px-3 py-3.5 text-right font-semibold">{usd(c.annualFee)}</td>
                  <td className="px-3 py-3.5">{c.upliftCapPct != null ? `${c.upliftCapPct}%` : <span className="text-muted">None found</span>}</td>
                  <td className="px-3 py-3.5">{c.autoRenew ? `Yes · ${c.noticeDays}-day notice` : "No"}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{shortDate(notice)}</span>
                      <DaysBadge days={daysUntil(notice)} />
                    </div>
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
