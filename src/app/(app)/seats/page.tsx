"use client";

import Link from "next/link";
import { usePortfolio } from "@/lib/portfolio";
import { usd } from "@/lib/format";
import { useTeam } from "@/lib/team/useTeam";
import type { SeatUsage } from "@/lib/types";
import { activeLabel, sinceLabel, unusedSeats } from "@/lib/usage";
import { neverLabel, UsageBar } from "@/components/SeatUsage";
import { Card, PageHeader, VendorLogo } from "@/components/ui";
import { hueFor, initialsFor } from "@/lib/saved";

interface Row {
  id: string;
  href: string;
  name: string;
  initials: string;
  hue: string;
  u: SeatUsage;
  unused: number;
  waste: number;
  kind: "contract" | "tool";
}

export default function SeatsPage() {
  const { contracts } = usePortfolio();
  const team = useTeam();

  const fromContracts: Row[] = contracts
    .filter((c) => c.usage)
    .map((c) => {
      const u = c.usage!;
      const unused = unusedSeats(u);
      const name = `${c.vendor}${c.product ? ` ${c.product}` : ""}`;
      return { id: c.id, href: `/contracts/${c.id}`, name, initials: c.initials, hue: c.hue, u, unused, waste: c.seats ? Math.round((unused * c.annualFee) / c.seats) : 0, kind: "contract" };
    });
  // Tools with sign-in data but no contract on file (e.g. found by auto-discovery). The sample team is covered by the sample contracts.
  const contractIds = new Set(contracts.map((c) => c.id));
  const fromTools: Row[] = (team.data?.tools ?? [])
    .filter((t) => !t.sample && !(t.contract_id && contractIds.has(t.contract_id)) && team.usage.has(t.id))
    .map((t) => {
      const u = team.usage.get(t.id)!;
      const unused = unusedSeats(u);
      const seats = t.seats ?? u.paid;
      return { id: t.id, href: `/tools/${t.id}`, name: t.name, initials: initialsFor(t.name), hue: hueFor(t.name), u, unused, waste: t.annual_cost && seats ? Math.round((unused * t.annual_cost) / seats) : 0, kind: "tool" };
    });
  const rows = [...fromContracts, ...fromTools].sort((a, b) => b.waste - a.waste || b.unused - a.unused);
  const totalWaste = rows.reduce((s, r) => s + r.waste, 0);
  const sources = Array.from(new Set(rows.map((r) => r.u.source)));
  const live = rows.some((r) => r.u.live);
  const mixed = live && rows.some((r) => !r.u.live);

  return (
    <>
      <PageHeader
        eyebrow={
          rows.length
            ? `From ${sources.join(" and ")} sign-ins · ${usd(totalWaste)} / yr on seats nobody used ${mixed ? "recently" : live ? "in the last 30 days" : "in 60 days"}`
            : "Who actually signs in, against what you pay for"
        }
        title="Seats & usage"
      />
      {rows.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted">
          <span>Seat usage appears once Google Workspace or Microsoft 365 is connected and a contract or tool has a seat count.</span>
          <Link href="/discover" className="font-semibold text-brand">Connect a sign-in source</Link>
        </Card>
      )}
      <Card label="Seat usage by app" className={rows.length ? "rtable-wrap overflow-x-auto" : "hidden"}>
        <table className="rtable w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <th scope="col" className="px-5 py-3 font-semibold">App</th>
              <th scope="col" className="px-3 py-3 font-semibold">Usage</th>
              <th scope="col" className="px-3 py-3 font-semibold">Last sign-in</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Paid</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Unused</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Cost of unused / yr</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, href, name, initials, hue, u, unused, waste, kind }) => (
              <tr key={`${kind}-${id}`} className="border-t border-line-soft">
                <td className="rt-full px-5 py-3.5">
                  <Link href={href} className="flex items-center gap-3 font-semibold text-ink">
                    <VendorLogo initials={initials} hue={hue} size={32} />
                    <span className="flex flex-col">
                      {name}
                      {kind === "tool" && <span className="text-xs font-normal text-muted">No contract on file</span>}
                    </span>
                  </Link>
                </td>
                <td data-label="Usage" className="rt-full w-[34%] px-3 py-3.5">
                  <UsageBar u={u} />
                  <span className="mt-1 block text-xs text-muted">
                    {[
                      `${u.active} active`,
                      u.inactive ? `${u.inactive} inactive ${activeLabel(u).replace(" days", "")}+ days` : "",
                      u.neverSignedIn ? `${u.neverSignedIn} ${neverLabel(u)}` : "",
                      `via ${u.source}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </td>
                <td data-label="Last sign-in" className="px-3 py-3.5 whitespace-nowrap text-ink-2">{u.lastLogin ? sinceLabel(u.lastLogin) : "—"}</td>
                <td data-label="Paid" className="px-3 py-3.5 text-right">{u.paid}</td>
                <td data-label="Unused" className="px-3 py-3.5 text-right font-semibold">{unused}</td>
                <td data-label="Cost of unused / yr" className="px-5 py-3.5 text-right font-display font-semibold text-good">{waste ? usd(waste) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="m-0 text-[13px] text-muted">
        Active means signed in during the last {mixed ? "30 days (60 for the sample contracts)" : live ? "30 days" : "60 days"}. Cost of unused is at today&apos;s per-seat price. What you can
        actually cut depends on each contract&apos;s seat-reduction terms, which the contract page applies.
      </p>
    </>
  );
}
