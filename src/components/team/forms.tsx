"use client";

import { useState } from "react";
import { CATEGORIES, guessCategory, type Department, type Survey, type SurveyInput, type ToolInput } from "@/lib/team/types";
import { ACTION_CLASS, ACTION_LABEL, type Action } from "@/lib/team/insights";
import { btnGhost, btnPrimary, cx } from "@/components/ui";

export const inputCls = "min-h-11 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm";
export const labelCls = "text-[13px] font-semibold text-ink-2";

export function ActionChip({ action }: { action: Action }) {
  return <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", ACTION_CLASS[action])}>{ACTION_LABEL[action]}</span>;
}

export function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role="status" className={cx("m-0 text-sm", msg.ok ? "text-good-dark" : "text-[#912018]")}>
      {msg.text}
    </p>
  );
}

export function DepartmentSelect({
  id,
  value,
  onChange,
  departments,
  allowNone = true,
  disabled,
}: {
  id: string;
  value: string | null;
  onChange: (v: string | null) => void;
  departments: Department[];
  allowNone?: boolean;
  disabled?: boolean;
}) {
  return (
    <select id={id} className={inputCls} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">Unassigned</option>}
      {departments.filter((d) => !d.sample).map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

/** Add or edit a tool by hand. */
export function ToolForm({
  initial,
  departments,
  lockDepartment,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolInput;
  departments: Department[];
  lockDepartment?: boolean;
  submitLabel: string;
  onSubmit: (t: ToolInput & { name: string }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [dept, setDept] = useState<string | null>(initial?.department_id ?? null);
  const [cost, setCost] = useState(initial?.annual_cost != null ? String(initial.annual_cost) : "");
  const [seats, setSeats] = useState(initial?.seats != null ? String(initial.seats) : "");
  const [renewal, setRenewal] = useState(initial?.renewal_date ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onSubmit({
          name: name.trim(),
          category: category || guessCategory(name),
          department_id: dept,
          annual_cost: cost.trim() ? Number(cost.replace(/[^0-9.]/g, "")) : null,
          seats: seats.trim() ? Number(seats) : null,
          renewal_date: renewal || null,
          description: description.trim() || null,
        });
        setBusy(false);
        if (ok && !initial) {
          setName("");
          setCategory("");
          setCost("");
          setSeats("");
          setRenewal("");
          setDescription("");
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tool-name" className={labelCls}>Tool</label>
        <input id="tool-name" required value={name} maxLength={120} placeholder="e.g. Asana" onChange={(e) => setName(e.target.value)} className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tool-cat" className={labelCls}>Category</label>
        <select id="tool-cat" value={category || (name ? guessCategory(name) : "")} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
          <option value="" disabled>Pick a category</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tool-dept" className={labelCls}>Department that pays for it</label>
        <DepartmentSelect id="tool-dept" value={dept} onChange={setDept} departments={departments} disabled={lockDepartment} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tool-cost" className={labelCls}>Annual cost (USD)</label>
        <input id="tool-cost" inputMode="decimal" value={cost} placeholder="12000" onChange={(e) => setCost(e.target.value)} className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tool-seats" className={labelCls}>Paid seats</label>
        <input id="tool-seats" type="number" min={0} value={seats} placeholder="25" onChange={(e) => setSeats(e.target.value)} className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tool-renewal" className={labelCls}>Renewal date</label>
        <input id="tool-renewal" type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="tool-desc" className={labelCls}>Notes (optional)</label>
        <input id="tool-desc" value={description} maxLength={1000} placeholder="Plan name, who manages it, anything leadership should know" onChange={(e) => setDescription(e.target.value)} className={inputCls} />
      </div>
      <div className="flex flex-wrap gap-2.5 sm:col-span-2">
        <button type="submit" className={btnPrimary} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={btnGhost} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

const CRIT_HINT = ["", "Nice to have", "Useful", "Important", "Hard to work without", "Business-critical"];

/** The 4-question survey for one tool. */
export function SurveyForm({
  toolName,
  seats,
  previous,
  onSubmit,
}: {
  toolName: string;
  seats: number | null;
  previous?: Survey | null;
  onSubmit: (a: SurveyInput) => Promise<boolean>;
}) {
  const [purpose, setPurpose] = useState(previous?.purpose ?? "");
  const [crit, setCrit] = useState<number>(previous?.criticality ?? 0);
  const [replacement, setReplacement] = useState(previous?.replacement ?? "");
  const [none, setNone] = useState(previous?.no_replacement_needed ?? false);
  const [seatsNeeded, setSeatsNeeded] = useState<SurveyInput["seats_needed"]>(previous?.seats_needed ?? "all");
  const [count, setCount] = useState(previous?.seats_needed_count != null ? String(previous.seats_needed_count) : "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit({
          purpose: purpose.trim(),
          criticality: crit,
          replacement: none ? null : replacement.trim() || null,
          no_replacement_needed: none,
          seats_needed: seatsNeeded,
          seats_needed_count: seatsNeeded === "some" && count ? Number(count) : null,
        });
        setBusy(false);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="q1" className={labelCls}>1. What does your team use {toolName} for?</label>
        <textarea id="q1" required rows={3} maxLength={1000} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Sprint planning and bug tracking for 3 squads" className={cx(inputCls, "py-2.5")} />
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className={cx(labelCls, "mb-2")}>2. How critical is it? (1 = nice to have, 5 = we&apos;d stop working)</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className={cx(
                "flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[10px] border px-3 text-sm font-semibold",
                crit === n ? "border-brand bg-brand text-white" : "border-[#D0D5DD] bg-white text-ink hover:bg-[#EEF2F7]",
              )}
            >
              <input type="radio" name="crit" value={n} checked={crit === n} onChange={() => setCrit(n)} className="sr-only" required />
              {n}
            </label>
          ))}
          {crit > 0 && <span className="self-center text-[13px] text-muted">{CRIT_HINT[crit]}</span>}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="q3" className={labelCls}>3. If {toolName} disappeared tomorrow, what would you use instead?</label>
        <input id="q3" disabled={none} value={none ? "" : replacement} maxLength={300} onChange={(e) => setReplacement(e.target.value)} placeholder="e.g. Asana, which marketing already uses" className={inputCls} />
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink-2">
          <input type="checkbox" className="h-5 w-5 accent-[#1D4ED8]" checked={none} onChange={(e) => setNone(e.target.checked)} />
          We wouldn&apos;t need a replacement
        </label>
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className={cx(labelCls, "mb-2")}>4. Do you need all {seats ? `${seats} ` : ""}seats?</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "Yes, all of them"],
              ["some", "No, fewer would do"],
              ["unsure", "Not sure"],
            ] as const
          ).map(([v, label]) => (
            <label
              key={v}
              className={cx(
                "flex min-h-11 cursor-pointer items-center rounded-[10px] border px-3.5 text-sm font-semibold",
                seatsNeeded === v ? "border-brand bg-brand-soft text-brand-dark" : "border-[#D0D5DD] bg-white text-ink hover:bg-[#EEF2F7]",
              )}
            >
              <input type="radio" name="seats" value={v} checked={seatsNeeded === v} onChange={() => setSeatsNeeded(v)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {seatsNeeded === "some" && (
          <div className="flex max-w-[260px] flex-col gap-1.5">
            <label htmlFor="q4n" className="text-[13px] text-muted">How many seats do you actually need?</label>
            <input id="q4n" type="number" min={0} max={seats ?? undefined} value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} />
          </div>
        )}
      </fieldset>

      <button type="submit" className={cx(btnPrimary, "self-start")} disabled={busy || !purpose.trim() || crit === 0}>
        {busy ? "Saving…" : previous ? "Update answers" : "Submit answers"}
      </button>
    </form>
  );
}
