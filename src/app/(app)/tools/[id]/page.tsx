"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { btnGhost, Card, H2, PageHeader } from "@/components/ui";
import { ActionChip, DepartmentSelect, labelCls, Notice, SurveyForm, ToolForm } from "@/components/team/forms";
import { TeamError } from "@/components/team/TeamError";
import { longDate, usd } from "@/lib/format";
import { latestSurveys } from "@/lib/team/insights";
import { useTeam } from "@/lib/team/useTeam";

export default function ToolPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const team = useTeam();
  const { data, insights, me, isAdmin, canEdit, run } = team;
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (team.error) return <TeamError message={team.error} />;
  if (!data || !insights) return <p className="text-muted">Loading…</p>;
  const tool = data.tools.find((t) => t.id === id);
  if (!tool) {
    return (
      <Card label="Not found" className="p-5 text-sm">
        That tool isn&apos;t in this workspace. <Link href="/tools" className="font-semibold text-brand">Back to tools</Link>
      </Card>
    );
  }
  const editable = canEdit(tool);
  const row = insights.rows.find((r) => r.tool.id === tool.id);
  const history = data.surveys.filter((s) => s.tool_id === tool.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = latestSurveys(history).get(tool.id) ?? null;
  const dept = data.departments.find((d) => d.id === tool.department_id);

  // Next tool waiting for this person's answers, to keep them moving.
  const answered = latestSurveys(data.surveys);
  const nextTool = data.tools.find(
    (t) => t.id !== tool.id && canEdit(t) && !answered.has(t.id) && (isAdmin || t.department_id === me?.department_id),
  );

  return (
    <>
      <Link href="/tools" className="text-sm font-semibold text-brand">← All tools</Link>
      <PageHeader
        eyebrow={`${tool.category} · ${dept?.name ?? "Unassigned"}${tool.source === "upload" ? " · from an uploaded contract" : ""}`}
        title={tool.name}
      >
        {editable && !editing && (
          <button type="button" className={btnGhost} onClick={() => setEditing(true)}>
            Edit details
          </button>
        )}
      </PageHeader>

      {tool.sample && (
        <p className="m-0 text-[13px] text-muted">This is sample data for the fictional Northwind Logistics, so it can&apos;t be edited.</p>
      )}

      {!tool.confirmed && editable && (
        <Card label="Confirm" className="flex flex-col gap-3 border-warn-line bg-warn-soft p-5">
          <H2>Is this one of your team&apos;s tools?</H2>
          <p className="m-0 text-sm text-ink-2">
            {tool.source === "import"
              ? "Radar found it in your accounting or sign-in data and filed it under this department. If it's yours, answer the survey below to confirm it; if not, pick the department that uses it."
              : "We found it in an uploaded contract. Pick the department that pays for it, or answer the survey below to confirm it."}
          </p>
          <div className="flex max-w-[360px] flex-col gap-1.5">
            <label htmlFor="confirm-dept" className={labelCls}>Department</label>
            <DepartmentSelect
              id="confirm-dept"
              value={tool.department_id}
              departments={isAdmin ? data.departments : data.departments.filter((d) => d.id === me?.department_id)}
              onChange={async (v) => {
                const r = await run({ op: "updateTool", id: tool.id, tool: { department_id: v, confirmed: Boolean(v) } });
                setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Could not save." });
              }}
            />
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="flex flex-col gap-6">
          <Card label="Survey" className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-1">
              <H2>{latest ? "Your team's answers" : "4 quick questions"}</H2>
              <span className="text-[13px] text-muted">
                {latest
                  ? `Last answered ${longDate(latest.created_at.slice(0, 10))}${latest.respondent_email ? ` by ${latest.respondent_email}` : ""}. Update them any time.`
                  : "Takes about a minute. Your answers go to leadership's dashboard."}
              </span>
            </div>
            {editable ? (
              <SurveyForm
                key={latest?.id ?? "new"}
                toolName={tool.name}
                seats={tool.seats}
                previous={latest}
                onSubmit={async (answers) => {
                  const r = await run({ op: "answerSurvey", tool_id: tool.id, answers });
                  if (!r.ok) {
                    setMsg({ ok: false, text: r.error ?? "Could not save your answers." });
                    return false;
                  }
                  if (nextTool) {
                    router.push(`/tools/${nextTool.id}`);
                  } else {
                    setMsg({ ok: true, text: "Thanks, answers saved." });
                  }
                  return true;
                }}
              />
            ) : latest ? (
              <dl className="m-0 grid gap-3 text-sm">
                <div><dt className={labelCls}>What it&apos;s used for</dt><dd className="m-0 mt-1">{latest.purpose}</dd></div>
                <div><dt className={labelCls}>Criticality</dt><dd className="m-0 mt-1">{latest.criticality} / 5</dd></div>
                <div>
                  <dt className={labelCls}>Replacement</dt>
                  <dd className="m-0 mt-1">{latest.no_replacement_needed ? "Wouldn't need one" : latest.replacement || "—"}</dd>
                </div>
                <div>
                  <dt className={labelCls}>Seats</dt>
                  <dd className="m-0 mt-1">
                    {latest.seats_needed === "all" ? "All needed" : latest.seats_needed === "some" ? `Needs ${latest.seats_needed_count ?? "fewer"}` : "Not sure"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="m-0 text-sm text-muted">Waiting for {dept?.name ?? "the owning department"} to answer.</p>
            )}
            <Notice msg={msg} />
          </Card>

          {editing && (
            <Card label="Edit tool" className="flex flex-col gap-4 p-5">
              <H2>Edit details</H2>
              <ToolForm
                initial={tool}
                departments={isAdmin ? data.departments : data.departments.filter((d) => d.id === me?.department_id)}
                submitLabel="Save"
                onCancel={() => setEditing(false)}
                onSubmit={async (t) => {
                  const r = await run({ op: "updateTool", id: tool.id, tool: t });
                  setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Could not save." });
                  if (r.ok) setEditing(false);
                  return r.ok;
                }}
              />
              <button
                type="button"
                className="self-start text-sm font-semibold text-[#912018]"
                onClick={async () => {
                  if (!window.confirm(`Remove ${tool.name} and its survey answers?`)) return;
                  const r = await run({ op: "deleteTool", id: tool.id });
                  if (r.ok) router.push("/tools");
                  else setMsg({ ok: false, text: r.error ?? "Could not remove it." });
                }}
              >
                Remove this tool
              </button>
            </Card>
          )}

          {history.length > 1 && (
            <Card label="History" className="flex flex-col gap-3 p-5">
              <H2>Earlier answers</H2>
              <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
                {history.slice(1).map((s) => (
                  <li key={s.id} className="py-2.5">
                    <span className="font-semibold">{longDate(s.created_at.slice(0, 10))}</span> · {s.criticality}/5 · {s.purpose}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card label="Details" className="flex flex-col gap-3 p-5 text-sm">
            <H2>Details</H2>
            <dl className="m-0 grid grid-cols-2 gap-3">
              <div><dt className="text-muted">Annual cost</dt><dd className="m-0 font-semibold">{tool.annual_cost != null ? usd(tool.annual_cost) : "—"}</dd></div>
              <div><dt className="text-muted">Seats</dt><dd className="m-0 font-semibold">{tool.seats ?? "—"}</dd></div>
              <div><dt className="text-muted">Renews</dt><dd className="m-0 font-semibold">{tool.renewal_date ? longDate(tool.renewal_date) : "—"}</dd></div>
              <div><dt className="text-muted">Department</dt><dd className="m-0 font-semibold">{dept?.name ?? "Unassigned"}</dd></div>
            </dl>
            {tool.description && <p className="m-0 text-ink-2">{tool.description}</p>}
            {tool.contract_id && (
              <Link href={`/contracts/${tool.contract_id}`} className="font-semibold text-brand">Open the contract →</Link>
            )}
          </Card>
          {isAdmin && row && (
            <Card label="Recommendation" className="flex flex-col gap-2 p-5 text-sm">
              <H2>Recommendation</H2>
              <ActionChip action={row.recommendation.action} />
              <p className="m-0 text-ink-2">{row.recommendation.reason}</p>
              {row.recommendation.savings > 0 && (
                <p className="m-0 font-semibold text-good-dark">Estimated saving: {usd(row.recommendation.savings)} / yr</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
