"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, cx, H2, PageHeader, Segmented } from "@/components/ui";
import { ActionChip } from "@/components/team/forms";
import { SampleTeamNote, TeamError } from "@/components/team/TeamError";
import { shortDate, usd, usdShort } from "@/lib/format";
import { ACTION_LABEL, type Action } from "@/lib/team/insights";
import { useTeam } from "@/lib/team/useTeam";
import { activeLabel, sinceLabel } from "@/lib/usage";
import { UsageBar } from "@/components/SeatUsage";

type Filter = "all" | Action;

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card label={label} className="flex flex-col gap-1 p-5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <span className="font-display text-[28px] font-semibold tracking-tight">{value}</span>
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
    </Card>
  );
}

export default function InsightsPage() {
  const team = useTeam();
  const { insights, isAdmin, raw } = team;
  const [filter, setFilter] = useState<Filter>("all");

  if (team.error) return <TeamError message={team.error} />;
  if (!insights || !raw) return <p className="text-muted">Loading the leadership view…</p>;

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Leadership view" />
        <Card label="Admins only" className="p-5 text-sm text-ink-2">
          This view is for admins. Your part is on <Link href="/tools" className="font-semibold text-brand">Tools &amp; survey</Link>: confirm your
          department&apos;s tools and answer the questions.
        </Card>
      </>
    );
  }

  const { totals, overlaps, lowValue, rows, byDepartment, surveyDue } = insights;
  const pct = totals.tools ? Math.round((totals.answered / totals.tools) * 100) : 0;
  const counts = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.recommendation.action]: (m[r.recommendation.action] ?? 0) + 1 }), {});
  const shown = rows.filter((r) => filter === "all" || r.recommendation.action === filter);
  const filters: Filter[] = ["all", "cancel", "consolidate", "cut_seats", "renegotiate", "needs_survey", "keep"];

  return (
    <>
      <PageHeader eyebrow="What every team pays for, why they use it, and what to do at each renewal" title="Leadership view" />
      <SampleTeamNote show={team.showingSample} />

      {totals.tools === 0 && (
        <Card label="Get started" className="flex flex-col gap-2 p-5 text-sm">
          <H2>No tools yet</H2>
          <p className="m-0 text-ink-2">
            <Link href="/setup" className="font-semibold text-brand">Run setup</Link> to add departments and invite their owners, or{" "}
            <Link href="/upload" className="font-semibold text-brand">upload a contract</Link>.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Annual SaaS spend tracked" value={usdShort(totals.spend)} sub={`${totals.tools} tools across ${byDepartment.filter((d) => d.id).length} departments`} />
        <Kpi label="Estimated savings" value={usdShort(totals.savings)} sub="If every recommendation is acted on" />
        <Kpi label="Survey answers" value={`${pct}%`} sub={`${totals.answered} of ${totals.tools} tools answered`} />
        <Kpi label="Overlapping tool groups" value={String(overlaps.length)} sub={overlaps.length ? `${usdShort(overlaps.reduce((s, o) => s + o.savings, 0))} to consolidate` : "None found"} />
      </div>

      <Card label="Overlaps" className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <H2>Teams paying for the same job</H2>
          <span className="text-[13px] text-muted">Tools in the same category bought by different departments. The suggested standard is the most widely used one.</span>
        </div>
        {overlaps.length === 0 && <p className="m-0 text-sm text-muted">No overlaps yet. They show up once two departments list tools in the same category.</p>}
        <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
          {overlaps.map((o) => (
            <div key={o.category} className="flex flex-col gap-3 rounded-xl border border-line-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold tracking-wide text-muted uppercase">{o.category}</span>
                  <span className="font-semibold">{o.summary}</span>
                </div>
                <span className="rounded-full bg-good-soft px-2.5 py-0.5 text-xs font-semibold text-good-dark">~{usd(o.savings)}/yr</span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
                {o.tools.map((t) => {
                  const r = rows.find((x) => x.tool.id === t.id);
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/tools/${t.id}`} className="text-ink hover:underline">
                        <span className="font-medium">{t.name}</span> <span className="text-muted">· {r?.department} · {t.seats ?? "?"} seats · {t.annual_cost != null ? usd(t.annual_cost) : "—"}</span>
                      </Link>
                      {t.id === o.standard.id ? (
                        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-dark">Standard</span>
                      ) : (
                        r && <ActionChip action={r.recommendation.action} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card label="Low value" className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1">
            <H2>High cost, low criticality</H2>
            <span className="text-[13px] text-muted">Tools over $5K a year that their own team rated 1 or 2 out of 5.</span>
          </div>
          {lowValue.length === 0 ? (
            <p className="m-0 text-sm text-muted">Nothing yet. This fills in as surveys come back.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
              {lowValue.map((r) => (
                <li key={r.tool.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <Link href={`/tools/${r.tool.id}`} className="flex flex-col text-ink hover:underline">
                    <span className="font-semibold">{r.tool.name}</span>
                    <span className="text-[13px] text-muted">{r.department} · rated {r.survey?.criticality}/5 · &ldquo;{r.survey?.purpose}&rdquo;</span>
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{usd(r.tool.annual_cost ?? 0)}</span>
                    <ActionChip action={r.recommendation.action} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card label="By department" className="flex flex-col gap-3 p-5">
          <H2>By department</H2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-muted uppercase">
                  <th scope="col" className="py-2 pr-3 font-semibold">Department</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Spend</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Tools</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Answered</th>
                  <th scope="col" className="py-2 pl-3 text-right font-semibold">Savings</th>
                </tr>
              </thead>
              <tbody>
                {byDepartment.map((d) => (
                  <tr key={d.id ?? "none"} className="border-t border-line-soft">
                    <td className={cx("py-2.5 pr-3 font-medium", !d.id && "text-warn")}>{d.name}</td>
                    <td className="px-3 py-2.5 text-right">{usd(d.spend)}</td>
                    <td className="px-3 py-2.5 text-right">{d.tools}</td>
                    <td className="px-3 py-2.5 text-right">{d.tools ? `${d.answered}/${d.tools}` : "—"}</td>
                    <td className="py-2.5 pl-3 text-right font-semibold text-good-dark">{d.savings ? usd(d.savings) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {surveyDue.length > 0 && (
        <Card label="Re-check before renewal" className="flex flex-col gap-3 border-warn-line p-5">
          <H2>Re-check before renewal</H2>
          <span className="text-[13px] text-muted">These renew within 45 days and have no recent answers. Ask the owner to update them before you decide.</span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
            {surveyDue.map((r) => (
              <li key={r.tool.id}>
                <Link href={`/tools/${r.tool.id}`} className="font-semibold text-ink hover:underline">{r.tool.name}</Link>{" "}
                <span className="text-muted">· {r.department} · renews {r.tool.renewal_date && shortDate(r.tool.renewal_date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card label="Recommendations" className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <H2>Recommendation for every tool</H2>
          <span className="text-[13px] text-muted">
            Based on the contract, seats, sign-ins from Google Workspace or Microsoft, and the owning team&apos;s answers. Savings are estimates.
          </span>
        </div>
        <div className="overflow-x-auto">
          <Segmented<Filter>
            label="Filter recommendations"
            value={filter}
            onChange={setFilter}
            options={filters
              .filter((f) => f === "all" || counts[f])
              .map((f) => ({ value: f, label: f === "all" ? `All (${rows.length})` : `${ACTION_LABEL[f]} (${counts[f]})` }))}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-muted uppercase">
                <th scope="col" className="py-2 pr-3 font-semibold">Tool</th>
                <th scope="col" className="px-3 py-2 font-semibold">Seats used</th>
                <th scope="col" className="px-3 py-2 font-semibold">Do this</th>
                <th scope="col" className="px-3 py-2 font-semibold">Why</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Cost</th>
                <th scope="col" className="px-3 py-2 font-semibold">Renews</th>
                <th scope="col" className="py-2 pl-3 text-right font-semibold">Est. saving</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.tool.id} className="border-t border-line-soft align-top">
                  <td className="py-3 pr-3">
                    <Link href={`/tools/${r.tool.id}`} className="flex flex-col text-ink hover:underline">
                      <span className="font-semibold">{r.tool.name}</span>
                      <span className="text-[13px] text-muted">{r.department}</span>
                    </Link>
                  </td>
                  <td className="w-[130px] px-3 py-3">
                    {r.usage ? (
                      <div className="flex flex-col gap-1" title={`${r.usage.source} sign-ins, last ${activeLabel(r.usage)}${r.usage.lastLogin ? ` · latest ${sinceLabel(r.usage.lastLogin)}` : ""}`}>
                        <span className="font-semibold">
                          {r.usage.active}
                          <span className="font-normal text-muted"> / {r.usage.paid}</span>
                        </span>
                        <UsageBar u={r.usage} />
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3"><ActionChip action={r.recommendation.action} /></td>
                  <td className="max-w-[360px] px-3 py-3 text-ink-2">{r.recommendation.reason}</td>
                  <td className="px-3 py-3 text-right">{r.tool.annual_cost != null ? usd(r.tool.annual_cost) : "—"}</td>
                  <td className="px-3 py-3">{r.tool.renewal_date ? shortDate(r.tool.renewal_date) : "—"}</td>
                  <td className="py-3 pl-3 text-right font-semibold text-good-dark">{r.recommendation.savings ? usd(r.recommendation.savings) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
