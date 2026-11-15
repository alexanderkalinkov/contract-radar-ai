"use client";

import { useState } from "react";
import { btnPrimary } from "@/components/ui";
import type { Department, OpResult, Role, TeamOp } from "@/lib/team/types";
import { DepartmentSelect, inputCls, Notice } from "./forms";

/** Invite someone by email into a department (or as an admin). */
export function InviteForm({
  departments,
  isAdmin,
  fixedDepartment,
  run,
  compact,
}: {
  departments: Department[];
  isAdmin: boolean;
  fixedDepartment?: string | null;
  run: (op: TeamOp) => Promise<OpResult>;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [dept, setDept] = useState<string | null>(fixedDepartment ?? null);
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const idp = `inv-${fixedDepartment ?? "any"}`;

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap gap-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const clean = email.trim().toLowerCase();
          const r = await run({ op: "invite", email: clean, department_id: fixedDepartment !== undefined ? fixedDepartment : dept, role });
          setBusy(false);
          if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Could not invite them." });
          setEmail("");
          setMsg({
            ok: true,
            text: r.emailed
              ? `Invite emailed to ${clean}. The link signs them straight into this workspace.`
              : r.emailNote ?? `Invited ${clean}. Ask them to create an account with that email.`,
          });
        }}
      >
        <label htmlFor={`${idp}-email`} className="sr-only">Email</label>
        <input
          id={`${idp}-email`}
          type="email"
          required
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${inputCls} min-w-[220px] flex-[2]`}
        />
        {fixedDepartment === undefined && (
          <div className="min-w-[170px] flex-1">
            <label htmlFor={`${idp}-dept`} className="sr-only">Department</label>
            <DepartmentSelect id={`${idp}-dept`} value={dept} onChange={setDept} departments={departments} />
          </div>
        )}
        {isAdmin && !compact && (
          <div className="min-w-[170px] flex-1">
            <label htmlFor={`${idp}-role`} className="sr-only">Role</label>
            <select id={`${idp}-role`} className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">Department owner</option>
              <option value="owner">Admin (C-level)</option>
            </select>
          </div>
        )}
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Sending…" : "Send invite"}
        </button>
      </form>
      <Notice msg={msg} />
    </div>
  );
}
