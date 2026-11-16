"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { btnGhost, btnPrimary, Card, cx, H2, PageHeader, Segmented } from "@/components/ui";
import { IconUpload } from "@/components/icons";
import { ActionChip, Notice, ToolForm } from "@/components/team/forms";
import { SampleTeamNote, TeamError } from "@/components/team/TeamError";
import { shortDate, usd } from "@/lib/format";
import { useTeam } from "@/lib/team/useTeam";

type Filter = "mine" | "all" | "unassigned" | "todo";

export default function ToolsPage() {
  const team = useTeam();
  const { data, insights, me, isAdmin, canEdit, run } = team;
  const [filter, setFilter] = useState<Filter | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const myDept = data?.departments.find((d) => d.id === me?.department_id) ?? null;
  const active: Filter = filter ?? (!isAdmin && myDept ? "mine" : "all");

  const byId = useMemo(() => new Map((insights?.rows ?? []).map((r) => [r.tool.id, r])), [insights]);
  const deptName = useMemo(() => new Map((data?.departments ?? []).map((d) => [d.id, d.name])), [data]);

  if (team.error) return <TeamError message={team.error} />;
  if (!data || !insights) return <p className="text-muted">Loading your tools…</p>;

  const tools = data.tools
    .filter((t) => {
      if (active === "mine") return t.department_id === me?.department_id;
      if (active === "unassigned") return !t.department_id;
      if (active === "todo") return canEdit(t) && !byId.get(t.id)?.survey;
      return true;
    })
    .sort((a, b) => Number(Boolean(byId.get(a.id)?.survey)) - Number(Boolean(byId.get(b.id)?.survey)) || (b.annual_cost ?? 0) - (a.annual_cost ?? 0));

  const myTools = data.tools.filter((t) => !t.sample && (isAdmin ? true : t.department_id === me?.department_id));
  const myOpen = myTools.filter((t) => !byId.get(t.id)?.survey);
  const unassigned = data.tools.filter((t) => !t.department_id && !t.sample);

  return (
    <>
      <PageHeader
        eyebrow={`${insights.totals.tools} tools · ${usd(insights.totals.spend)} a year · ${insights.totals.answered} of ${insights.totals.tools} surveys answered`}
        title="Tools & survey"
      >
        {isAdmin && (
          <Link href="/discover" className={btnGhost}>
            Find tools automatically
          </Link>
        )}
        {team.canWrite && (
          <>
            <Link href="/upload" className={btnGhost}>
              <IconUpload /> Upload contract
            </Link>
            <button type="button" className={btnPrimary} onClick={() => setAdding(!adding)} aria-expanded={adding}>
              + Add tool
            </button>
          </>
        )}
      </PageHeader>

      <SampleTeamNote show={team.showingSample} />

      {myTools.length > 0 && (
        <Card label="Your to-do" className="flex flex-wrap items-center justify-between gap-4 border-brand-line bg-brand-soft p-5">
          <div className="flex flex-col gap-1">
            <H2>
              {myOpen.length
                ? `${myOpen.length} of ${myTools.length} ${myDept && !isAdmin ? `${myDept.name} ` : ""}tools need your answers`
                : "All your tools are answered. Thank you!"}
            </H2>
            <span className="text-[13px] text-ink-2">
              {myOpen.length
                ? "Confirm each tool is yours and answer 4 quick questions. Leadership uses this to decide what to keep, cut or consolidate."
                : "We'll ask again a month before each renewal so the answers stay current."}
            </span>
          </div>
          {myOpen.length > 0 && (
            <Link href={`/tools/${myOpen[0].id}`} className={btnPrimary}>
              Start with {myOpen[0].name}
            </Link>
          )}
        </Card>
      )}

      {!isAdmin && team.canWrite && !myDept && (
        <Card label="No department" className="p-5 text-sm text-ink-2">
          You aren&apos;t in a department yet, so you see every tool. Ask an admin to add you to your team on the{" "}
          <Link href="/team" className="font-semibold text-brand">Team</Link> page.
        </Card>
      )}

      {adding && (
        <Card label="Add a tool" className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <H2>Add a tool by hand</H2>
            <span className="text-[13px] text-muted">
              No contract handy? Add the basics now and upload the contract later, or let Radar find tools in your accounting and sign-in data.
            </span>
          </div>
          <ToolForm
            departments={data.departments}
            initial={{ department_id: me?.department_id ?? null }}
            lockDepartment={!isAdmin && Boolean(me?.department_id)}
            submitLabel="Add tool"
            onCancel={() => setAdding(false)}
            onSubmit={async (tool) => {
              const r = await run({ op: "addTool", tool });
              setMsg(r.ok ? { ok: true, text: `Added ${tool.name}. Now answer its 4 questions.` } : { ok: false, text: r.error ?? "Could not add it." });
              if (r.ok) setAdding(false);
              return r.ok;
            }}
          />
        </Card>
      )}
      <Notice msg={msg} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Filter>
          label="Show"
          value={active}
          onChange={setFilter}
          options={[
            ...(myDept ? [{ value: "mine" as const, label: myDept.name }] : []),
            { value: "all", label: "All" },
            { value: "todo", label: "Needs answers" },
            { value: "unassigned", label: `Unassigned${unassigned.length ? ` (${unassigned.length})` : ""}` },
          ]}
        />
      </div>

      <Card label="Tools" className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <th scope="col" className="px-5 py-3 font-semibold">Tool</th>
              <th scope="col" className="px-3 py-3 font-semibold">Department</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Annual cost</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Seats</th>
              <th scope="col" className="px-3 py-3 font-semibold">Renews</th>
              <th scope="col" className="px-3 py-3 font-semibold">Survey</th>
              {isAdmin && <th scope="col" className="px-5 py-3 font-semibold">Recommendation</th>}
            </tr>
          </thead>
          <tbody>
            {tools.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted">
                  Nothing here yet. <Link href="/upload" className="font-semibold text-brand">Upload a contract</Link> or add a tool by hand.
                </td>
              </tr>
            )}
            {tools.map((t) => {
              const r = byId.get(t.id);
              return (
                <tr key={t.id} className="border-t border-line-soft hover:bg-[#F8FAFC]">
                  <td className="px-5 py-3.5">
                    <Link href={`/tools/${t.id}`} className="flex flex-col gap-0.5 text-ink">
                      <span className="font-semibold">
                        {t.name}
                        {t.sample && <span className="ml-2 rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-muted">Sample</span>}
                        {!t.confirmed && !t.sample && (
                          <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn-text">
                            {t.source === "import" ? "Found: confirm" : "From upload: confirm"}
                          </span>
                        )}
                      </span>
                      <span className="text-[13px] text-muted">{t.category}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3.5 text-ink-2">{t.department_id ? deptName.get(t.department_id) : <span className="text-warn">Unassigned</span>}</td>
                  <td className="px-3 py-3.5 text-right font-semibold">{t.annual_cost != null ? usd(t.annual_cost) : "—"}</td>
                  <td className="px-3 py-3.5 text-right">{t.seats ?? "—"}</td>
                  <td className="px-3 py-3.5">{t.renewal_date ? shortDate(t.renewal_date) : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-3.5">
                    {r?.survey ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium text-good-dark">Answered · {r.survey.criticality}/5</span>
                        {r.surveyDue && <span className="text-xs font-semibold text-warn">Re-check before renewal</span>}
                      </span>
                    ) : canEdit(t) ? (
                      <Link href={`/tools/${t.id}`} className={cx("inline-flex min-h-9 items-center rounded-[9px] bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-dark")}>
                        Answer 4 questions
                      </Link>
                    ) : (
                      <span className="text-muted">Waiting</span>
                    )}
                  </td>
                  {isAdmin && <td className="px-5 py-3.5">{r && <ActionChip action={r.recommendation.action} />}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
