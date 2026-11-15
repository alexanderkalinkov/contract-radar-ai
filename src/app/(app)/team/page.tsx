"use client";

import Link from "next/link";
import { useState } from "react";
import { btnGhost, btnPrimary, Card, H2, PageHeader } from "@/components/ui";
import { DepartmentSelect, inputCls, Notice } from "@/components/team/forms";
import { InviteForm } from "@/components/team/InviteForm";
import { TeamError } from "@/components/team/TeamError";
import { usd } from "@/lib/format";
import { roleLabel } from "@/lib/team/types";
import { useTeam } from "@/lib/team/useTeam";

export default function TeamPage() {
  const team = useTeam();
  const { raw, insights, me, isAdmin, run } = team;
  const [newDept, setNewDept] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  if (team.error) return <TeamError message={team.error} />;
  if (!raw || !insights) return <p className="text-muted">Loading your team…</p>;
  const { departments, members, invites } = raw;
  const say = (r: { ok: boolean; error?: string }, ok: string) => setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Something went wrong." });
  const deptStats = new Map(insights.byDepartment.map((d) => [d.id, d]));
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <PageHeader eyebrow="Departments, who owns them, and who can see what" title="Team">
        {isAdmin && (
          <Link href="/setup" className={btnGhost}>
            Run setup again
          </Link>
        )}
      </PageHeader>

      {team.mode === "demo" && (
        <p className="m-0 text-[13px] text-muted">
          Demo mode: the team is saved in this browser only and no emails are sent. Connect Supabase to invite real people.
        </p>
      )}

      <Card label="Roles" className="grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Admin (C-level)</span>
          <span className="text-ink-2">Sets up the workspace, invites people, sees the leadership view with recommendations for every tool.</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Department owner</span>
          <span className="text-ink-2">Confirms their department&apos;s tools, uploads contracts and answers the 4-question survey for each tool.</span>
        </div>
      </Card>

      <Card label="Departments" className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <H2>Departments</H2>
          <span className="text-[13px] text-muted">Invite one owner per department. They&apos;ll see the tools filed under it and a survey for each.</span>
        </div>
        {departments.length === 0 && <p className="m-0 text-sm text-muted">No departments yet.</p>}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {departments.map((d) => {
            const owners = members.filter((m) => m.department_id === d.id);
            const pending = invites.filter((i) => i.department_id === d.id);
            const s = deptStats.get(d.id);
            return (
              <li key={d.id} className="flex flex-col gap-3 rounded-xl border border-line-soft p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {renaming?.id === d.id ? (
                    <form
                      className="flex flex-wrap gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        say(await run({ op: "renameDepartment", id: d.id, name: renaming.name }), "Renamed.");
                        setRenaming(null);
                      }}
                    >
                      <label htmlFor={`rn-${d.id}`} className="sr-only">Department name</label>
                      <input id={`rn-${d.id}`} className={inputCls} value={renaming.name} maxLength={60} onChange={(e) => setRenaming({ id: d.id, name: e.target.value })} />
                      <button type="submit" className={btnGhost}>Save</button>
                    </form>
                  ) : (
                    <span className="font-display text-[17px] font-semibold">{d.name}</span>
                  )}
                  <span className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
                    <span>{s?.tools ?? 0} tools · {usd(s?.spend ?? 0)}/yr · {s?.answered ?? 0} answered</span>
                    {isAdmin && renaming?.id !== d.id && (
                      <>
                        <button type="button" className="min-h-9 font-semibold text-brand" onClick={() => setRenaming({ id: d.id, name: d.name })}>Rename</button>
                        <button
                          type="button"
                          className="min-h-9 font-semibold text-[#912018]"
                          onClick={async () => {
                            if (!window.confirm(`Delete ${d.name}? Its tools and people become unassigned.`)) return;
                            say(await run({ op: "deleteDepartment", id: d.id }), `Deleted ${d.name}.`);
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {owners.map((m) => (
                    <span key={m.user_id} className="rounded-full bg-chip px-3 py-1">{m.email}</span>
                  ))}
                  {pending.map((i) => (
                    <span key={i.id} className="rounded-full bg-warn-soft px-3 py-1 text-warn-text">{i.email} · invited</span>
                  ))}
                  {owners.length + pending.length === 0 && <span className="font-semibold text-warn">No owner yet</span>}
                </div>
                {(isAdmin || me?.department_id === d.id) && (
                  <InviteForm departments={departments} isAdmin={isAdmin} fixedDepartment={d.id} run={run} compact />
                )}
              </li>
            );
          })}
        </ul>
        {isAdmin && (
          <form
            className="flex flex-wrap gap-2.5"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run({ op: "addDepartments", names: [newDept] });
              say(r, `Added ${newDept}.`);
              if (r.ok) setNewDept("");
            }}
          >
            <label htmlFor="new-dept" className="sr-only">New department</label>
            <input id="new-dept" className={`${inputCls} max-w-[320px]`} placeholder="New department, e.g. Legal" value={newDept} maxLength={60} onChange={(e) => setNewDept(e.target.value)} />
            <button type="submit" className={btnPrimary} disabled={!newDept.trim()}>Add department</button>
          </form>
        )}
        <Notice msg={msg} />
      </Card>

      <Card label="People" className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <H2>People</H2>
          <span className="text-[13px] text-muted">Everyone here sees the same workspace. Admins choose each person&apos;s department and role.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-muted uppercase">
                <th scope="col" className="py-2 pr-3 font-semibold">Person</th>
                <th scope="col" className="px-3 py-2 font-semibold">Department</th>
                <th scope="col" className="px-3 py-2 font-semibold">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t border-line-soft">
                  <td className="py-2.5 pr-3">
                    {m.email}
                    {m.user_id === me?.user_id && <span className="text-muted"> (you)</span>}
                    {m.job_title && <span className="block text-[13px] text-muted">{m.job_title}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {isAdmin ? (
                      <DepartmentSelect
                        id={`md-${m.user_id}`}
                        value={m.department_id}
                        departments={departments}
                        onChange={async (v) => say(await run({ op: "updateMember", user_id: m.user_id, department_id: v }), "Saved.")}
                      />
                    ) : (
                      departments.find((d) => d.id === m.department_id)?.name ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {isAdmin && m.user_id !== me?.user_id ? (
                      <select
                        aria-label={`Role for ${m.email}`}
                        className={inputCls}
                        value={m.role}
                        onChange={async (e) => say(await run({ op: "updateMember", user_id: m.user_id, role: e.target.value as "owner" | "member" }), "Saved.")}
                      >
                        <option value="member">Department owner</option>
                        <option value="owner">Admin (C-level)</option>
                      </select>
                    ) : (
                      <span className="rounded-full bg-chip px-2.5 py-0.5 text-xs font-semibold text-ink-2">{roleLabel(m)}</span>
                    )}
                  </td>
                </tr>
              ))}
              {invites.map((i) => (
                <tr key={i.id} className="border-t border-line-soft text-muted">
                  <td className="py-2.5 pr-3">{i.email}</td>
                  <td className="px-3 py-2.5">{departments.find((d) => d.id === i.department_id)?.name ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn-text">
                        Invited · {i.role === "owner" ? "Admin" : "Dept owner"}
                      </span>
                      <button
                        type="button"
                        className="min-h-9 px-1 text-xs font-semibold text-brand"
                        onClick={() => {
                          navigator.clipboard?.writeText(`${origin}/login?mode=signup`).catch(() => undefined);
                          setMsg({ ok: true, text: `Copied ${origin}/login?mode=signup. Send it to ${i.email}: they create an account with that email and land in this workspace.` });
                        }}
                      >
                        Copy sign-up link
                      </button>
                      <button type="button" className="min-h-9 px-1 text-xs font-semibold text-brand" onClick={async () => say(await run({ op: "cancelInvite", id: i.id }), "Invite cancelled.")}>
                        Cancel
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <InviteForm departments={departments} isAdmin={isAdmin} run={run} />
      </Card>
    </>
  );
}
