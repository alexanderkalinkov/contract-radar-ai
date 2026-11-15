"use client";

import Link from "next/link";
import { usePortfolio } from "@/lib/portfolio";
import { usd } from "@/lib/format";
import { Card, PageHeader, VendorLogo } from "@/components/ui";

export default function SeatsPage() {
  const { contracts: CONTRACTS } = usePortfolio();
  const rows = CONTRACTS.filter((c) => c.usage)
    .map((c) => {
      const u = c.usage!;
      const unused = u.inactive + u.neverSignedIn;
      return { c, u, unused, waste: Math.round((unused * c.annualFee) / c.seats) };
    })
    .sort((a, b) => b.waste - a.waste);
  const totalWaste = rows.reduce((s, r) => s + r.waste, 0);

  return (
    <>
      <PageHeader eyebrow={`From Okta and Google Workspace sign-ins · ${usd(totalWaste)} / yr on seats nobody used in 60 days`} title="Seats & usage" />
      {rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted">
          Seat usage appears once a login source (Google Workspace, Microsoft 365 or Okta) is connected. Those connectors
          are coming next.
        </Card>
      )}
      <Card label="Seat usage by app" className={rows.length ? "overflow-x-auto" : "hidden"}>
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <th scope="col" className="px-5 py-3 font-semibold">App</th>
              <th scope="col" className="px-3 py-3 font-semibold">Usage (last 60 days)</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Paid</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Unused</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Cost of unused / yr</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, u, unused, waste }) => (
              <tr key={c.id} className="border-t border-line-soft">
                <td className="px-5 py-3.5">
                  <Link href={`/contracts/${c.id}`} className="flex items-center gap-3 font-semibold text-ink">
                    <VendorLogo initials={c.initials} hue={c.hue} size={32} />
                    {c.vendor} {c.product}
                  </Link>
                </td>
                <td className="w-[38%] px-3 py-3.5">
                  <div className="flex h-3 overflow-hidden rounded-md" role="img" aria-label={`${u.active} active, ${u.inactive} inactive, ${u.neverSignedIn} never signed in`}>
                    <div className="bg-brand" style={{ width: `${(u.active / u.paid) * 100}%` }} />
                    <div className="bg-[#F79009]" style={{ width: `${(u.inactive / u.paid) * 100}%` }} />
                    <div className="bg-[#7A2E0B]" style={{ width: `${(u.neverSignedIn / u.paid) * 100}%` }} />
                  </div>
                  <span className="mt-1 block text-xs text-muted">
                    {u.active} active · {u.inactive} inactive · {u.neverSignedIn} never signed in · via {u.source}
                  </span>
                </td>
                <td className="px-3 py-3.5 text-right">{u.paid}</td>
                <td className="px-3 py-3.5 text-right font-semibold">{unused}</td>
                <td className="px-5 py-3.5 text-right font-display font-semibold text-good">{usd(waste)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="m-0 text-[13px] text-muted">
        Cost of unused is at today&apos;s per-seat price. What you can actually cut depends on each contract&apos;s seat-reduction
        terms, which the contract page applies.
      </p>
    </>
  );
}
