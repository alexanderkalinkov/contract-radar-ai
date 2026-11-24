"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FEE_CAP,
  FEE_RATE,
  FEE_STATUS_LABEL,
  feeBreakdown,
  KINDS,
  kindLabel,
  ledgerTotals,
  money,
  pct,
  SOURCES,
  sourceLabel,
  STATUS_LABEL,
  type Saving,
  type SavingCandidate,
  type SavingInput,
  type SavingKind,
  type SavingOp,
  type SavingSource,
} from "@/lib/billing/savings";
import { btnGhost, btnPrimary, btnSoft, Card, cx, H2 } from "@/components/ui";

type ContractLite = { id: string; vendor: string; annualFee: number | null; currency: string; termEnd: string | null };
type Data = {
  savings: Saving[];
  candidates: SavingCandidate[];
  contracts: ContractLite[];
  onSavingsPlan?: boolean;
  canRecord?: boolean;
  canConfirm?: boolean;
  setupNeeded?: string;
};

const field = "min-h-11 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm font-normal text-ink";
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const sum = (xs: { currency: string; amount: number }[]) => (xs.length ? xs.map((x) => money(x.amount, x.currency)).join(" + ") : money(0));

export function SavingsLedger() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<SavingInput> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/savings", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Data & { error?: string };
    if (!res.ok) setError(json.error ?? "Couldn't load the savings ledger.");
    else setData(json);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function send(op: SavingOp): Promise<boolean> {
    setError(null);
    setNotice(null);
    const res = await fetch("/api/savings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Try again.");
      return false;
    }
    if (json.message) setNotice(json.message);
    await load();
    return true;
  }

  const totals = useMemo(() => ledgerTotals(data?.savings ?? []), [data]);
  if (!data) return <p className="m-0 text-sm text-muted">{error ?? "Loading…"}</p>;

  return (
    <div className="flex flex-col gap-6">
      {data.setupNeeded && <p className="m-0 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-text">{data.setupNeeded}</p>}

      <Card className={cx("flex flex-col gap-2 p-5 text-sm", data.onSavingsPlan ? "border-brand-line bg-brand-soft" : "")} label="How savings are billed">
        {data.onSavingsPlan ? (
          <p className="m-0 text-ink-2">
            You&apos;re on <strong>Savings share</strong>. When a saving is confirmed, we invoice {pct(FEE_RATE)} of its first-year value, at most{" "}
            {money(FEE_CAP)} per saving, minus the platform fees you paid in the last 12 months. No savings, no fee.
          </p>
        ) : (
          <p className="m-0 text-ink-2">
            Every saving Outflow helped you make is tracked here, with its baseline and evidence. Your plan is a flat fee, so nothing here is billed.{" "}
            <Link href="/billing" className="font-semibold text-brand underline underline-offset-2">Savings share</Link> charges a share of these savings instead.
          </p>
        )}
        <p className="m-0 text-muted">
          A saving counts when it came from an Outflow recommendation: an approved renewal decision, a pushback email Outflow drafted, or a savings
          opportunity Outflow flagged. An admin or Finance approver confirms each one.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Confirmed savings / yr" value={sum(totals.confirmed)} good />
        <Stat label={`Waiting for confirmation (${totals.pendingCount})`} value={sum(totals.pending)} strong={Boolean(data.canConfirm && totals.pendingCount)} />
        <Stat label="Savings fees, before credits" value={sum(totals.fees)} />
      </div>

      {error && (
        <p role="alert" className="m-0 rounded-lg bg-[#FEE4E2] px-4 py-3 text-sm text-[#912018]">
          {error}
        </p>
      )}
      {notice && <p className="m-0 rounded-lg bg-good-soft px-4 py-3 text-sm text-good-dark">{notice}</p>}

      {data.canRecord && data.candidates.length > 0 && !form && (
        <Card className="flex flex-col gap-3 p-5" label="Approved decisions to record">
          <H2>Approved decisions to record</H2>
          <p className="m-0 text-sm text-muted">Once the renewal is signed, record what it actually costs now.</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.candidates.map((c) => (
              <li key={c.reviewId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-semibold">{c.vendor}</span>
                  <span className="text-xs text-muted">
                    {c.recommendation}
                    {c.expectedSavings ? ` · expected ${money(c.expectedSavings, c.currency)}/yr` : ""}
                    {c.decidedAt ? ` · approved ${date(c.decidedAt)}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className={btnSoft}
                  onClick={() =>
                    setForm({
                      source: "approval",
                      reviewId: c.reviewId,
                      contractId: c.contractId,
                      vendor: c.vendor,
                      kind: c.kind,
                      currency: c.currency,
                      baselineAnnual: c.baselineAnnual ?? undefined,
                      newAnnual: c.baselineAnnual != null && c.expectedSavings != null ? Math.max(0, c.baselineAnnual - c.expectedSavings) : undefined,
                      baselineNote: c.baselineNote,
                    })
                  }
                >
                  Record outcome
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {form ? (
        <RecordForm
          initial={form}
          data={data}
          onCancel={() => setForm(null)}
          onSave={async (input) => {
            if (await send({ op: "record", ...input })) {
              setForm(null);
              setNotice(data.canConfirm ? "Recorded. Confirm it below when you're happy with the numbers." : "Recorded. An admin or Finance approver will confirm it.");
            }
          }}
        />
      ) : (
        data.canRecord && (
          <div>
            <button type="button" className={btnPrimary} onClick={() => setForm({ source: "pushback", kind: "price", currency: "EUR" })}>
              Record a saving
            </button>
          </div>
        )
      )}

      <div className="flex flex-col gap-3">
        <H2>Savings ledger</H2>
        <div className="rtable-wrap overflow-x-auto rounded-[14px] border border-line bg-white">
          <table className="rtable w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-muted">
                <th className="px-3 py-2.5">VENDOR</th>
                <th className="px-3 py-2.5">BASELINE → NEW</th>
                <th className="px-3 py-2.5">SAVING / YR</th>
                <th className="px-3 py-2.5">STATUS</th>
                <th className="px-3 py-2.5">FEE</th>
                <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.savings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted">No savings recorded yet.</td>
                </tr>
              )}
              {data.savings.map((s) => (
                <LedgerRow key={s.id} s={s} canConfirm={Boolean(data.canConfirm)} canRecord={Boolean(data.canRecord)} send={send} onSavingsPlan={Boolean(data.onSavingsPlan)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LedgerRow({ s, canConfirm, canRecord, onSavingsPlan, send }: { s: Saving; canConfirm: boolean; canRecord: boolean; onSavingsPlan: boolean; send: (op: SavingOp) => Promise<boolean> }) {
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");
  const open = s.status === "pending" || s.status === "disputed";
  const preview = onSavingsPlan && open ? feeBreakdown(s.annualSaving, 0) : null;
  return (
    <tr className={cx("border-b border-line-soft align-top last:border-0", s.status === "void" && "text-muted")}>
      <td data-label="Vendor" className="px-3 py-3">
        <div className="flex flex-col gap-0.5">
          {s.contractId ? (
            <Link href={`/contracts/${s.contractId}`} className="font-semibold text-ink hover:underline">{s.vendor}</Link>
          ) : (
            <span className="font-semibold">{s.vendor}</span>
          )}
          <span className="text-xs text-muted">{kindLabel(s.kind)} · {sourceLabel(s.source)}</span>
          <span className="text-xs text-muted">Recorded {date(s.recordedAt)}{s.recordedByEmail ? ` by ${s.recordedByEmail}` : ""}</span>
        </div>
      </td>
      <td data-label="Baseline → new" className="px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <span>
            {money(s.baselineAnnual, s.currency)} → {money(s.newAnnual, s.currency)}
          </span>
          <span className="text-xs text-muted">{s.baselineNote}</span>
          {s.evidence && <span className="text-xs whitespace-pre-line text-muted">{s.evidence}</span>}
        </div>
      </td>
      <td data-label="Saving / yr" className="px-3 py-3 font-semibold text-good">{money(s.annualSaving, s.currency)}</td>
      <td data-label="Status" className="px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <span className={cx("w-fit rounded-full px-2 py-0.5 text-xs font-semibold", s.status === "confirmed" ? "bg-good-soft text-good-dark" : s.status === "disputed" ? "bg-warn-soft text-warn-text" : "bg-chip text-ink-2")}>
            {STATUS_LABEL[s.status]}
          </span>
          {s.confirmedAt && <span className="text-xs text-muted">{date(s.confirmedAt)}{s.confirmedByEmail ? ` by ${s.confirmedByEmail}` : ""}</span>}
          {s.disputeNote && <span className="text-xs text-warn-text">{s.disputeNote}</span>}
        </div>
      </td>
      <td data-label="Fee" className="px-3 py-3">
        {s.status === "confirmed" ? (
          <div className="flex flex-col gap-0.5">
            {s.feeStatus !== "not_billed" && s.feeGross != null && <span>{money(s.feeNet ?? s.feeGross, s.currency)}</span>}
            <span className="text-xs text-muted">
              {FEE_STATUS_LABEL[s.feeStatus]}
              {s.creditApplied ? ` · ${money(s.creditApplied, s.currency)} credited` : ""}
            </span>
            {s.invoiceUrl && (
              <a href={s.invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand underline underline-offset-2">
                View invoice
              </a>
            )}
          </div>
        ) : preview ? (
          <span className="text-xs text-muted">{money(preview.gross, s.currency)} before credits</span>
        ) : (
          <span className="text-xs text-muted">–</span>
        )}
      </td>
      <td data-label="" className="rt-end px-3 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          {open && canConfirm && (
            <button type="button" className={btnPrimary} onClick={() => send({ op: "confirm", id: s.id })}>
              Confirm
            </button>
          )}
          {s.status === "pending" && canConfirm && !disputing && (
            <button type="button" className={btnGhost} onClick={() => setDisputing(true)}>
              Dispute
            </button>
          )}
          {open && canRecord && (
            <button type="button" className={btnGhost} onClick={() => send({ op: "withdraw", id: s.id })}>
              Withdraw
            </button>
          )}
          {s.status === "confirmed" && s.feeStatus === "failed" && !s.invoiceUrl && canConfirm && (
            <button type="button" className={btnSoft} onClick={() => send({ op: "retry_invoice", id: s.id })}>
              Retry invoice
            </button>
          )}
        </div>
        {disputing && (
          <form
            className="mt-2 flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await send({ op: "dispute", id: s.id, note })) setDisputing(false);
            }}
          >
            <textarea className={cx(field, "min-h-20 py-2")} placeholder="What's wrong with this saving?" value={note} onChange={(e) => setNote(e.target.value)} required />
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setDisputing(false)}>Cancel</button>
              <button type="submit" className={btnSoft}>Send dispute</button>
            </div>
          </form>
        )}
      </td>
    </tr>
  );
}

function RecordForm({ initial, data, onSave, onCancel }: { initial: Partial<SavingInput>; data: Data; onSave: (i: SavingInput) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<Partial<SavingInput>>(initial);
  const set = <K extends keyof SavingInput>(k: K, v: SavingInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const fromReview = Boolean(initial.reviewId);
  const saving = f.baselineAnnual != null && f.newAnnual != null ? f.baselineAnnual - f.newAnnual : null;
  const fee = saving && saving > 0 && data.onSavingsPlan ? feeBreakdown(saving, 0) : null;
  const numberValue = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <Card className="flex flex-col gap-4 p-5" label="Record a saving">
      <H2>{fromReview ? `Record the outcome for ${initial.vendor}` : "Record a saving"}</H2>
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const c = data.contracts.find((x) => x.id === f.contractId);
          await onSave({
            contractId: f.contractId ?? null,
            reviewId: f.reviewId ?? null,
            newContractId: f.newContractId || null,
            vendor: f.vendor || c?.vendor || "",
            source: (f.source ?? "pushback") as SavingSource,
            kind: (f.kind ?? "price") as SavingKind,
            currency: f.currency ?? "EUR",
            baselineAnnual: f.baselineAnnual ?? 0,
            newAnnual: f.newAnnual ?? 0,
            baselineNote: f.baselineNote ?? "",
            evidence: f.evidence ?? null,
            signedOn: f.signedOn ?? null,
          });
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Where it came from
          <select className={field} value={f.source} disabled={fromReview} onChange={(e) => set("source", e.target.value as SavingSource)}>
            {SOURCES.filter((s) => fromReview || s.value !== "approval").map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted">{SOURCES.find((s) => s.value === f.source)?.hint}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Contract
          <select
            className={field}
            value={f.contractId ?? ""}
            disabled={fromReview}
            required
            onChange={(e) => {
              const c = data.contracts.find((x) => x.id === e.target.value);
              setF((x) => ({
                ...x,
                contractId: e.target.value,
                vendor: c?.vendor,
                currency: c?.currency ?? x.currency,
                baselineAnnual: x.baselineAnnual ?? c?.annualFee ?? undefined,
                baselineNote: x.baselineNote || (c?.annualFee ? "Current annual price on the contract" : ""),
              }));
            }}
          >
            <option value="">Pick a contract</option>
            {data.contracts.map((c) => (
              <option key={c.id} value={c.id}>{c.vendor}{c.termEnd ? ` · ends ${c.termEnd}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Kind of saving
          <select className={field} value={f.kind} onChange={(e) => set("kind", e.target.value as SavingKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Currency
          <input className={field} value={f.currency ?? ""} maxLength={3} required onChange={(e) => set("currency", e.target.value.toUpperCase())} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Baseline: next 12 months without the change
          <input className={field} type="number" min={0} step="0.01" required value={f.baselineAnnual ?? ""} onChange={(e) => set("baselineAnnual", numberValue(e.target.value) as number)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          New annual price (0 if cancelled)
          <input className={field} type="number" min={0} step="0.01" required value={f.newAnnual ?? ""} onChange={(e) => set("newAnnual", numberValue(e.target.value) as number)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold md:col-span-2">
          Where the baseline comes from
          <input
            className={field}
            required
            maxLength={500}
            placeholder="For example: renewal quote of 1 Oct 2026, or current price plus the 7% uplift in §8.2"
            value={f.baselineNote ?? ""}
            onChange={(e) => set("baselineNote", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Signed on
          <input className={field} type="date" value={f.signedOn ?? ""} onChange={(e) => set("signedOn", e.target.value || null)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Signed document in Outflow (optional)
          <select className={field} value={f.newContractId ?? ""} onChange={(e) => set("newContractId", e.target.value || null)}>
            <option value="">None</option>
            {data.contracts.map((c) => (
              <option key={c.id} value={c.id}>{c.vendor}{c.termEnd ? ` · ends ${c.termEnd}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold md:col-span-2">
          Evidence (optional)
          <textarea
            className={cx(field, "min-h-20 py-2")}
            maxLength={4000}
            placeholder="What changed and how you know: the vendor's reply, the new order form, seats removed."
            value={f.evidence ?? ""}
            onChange={(e) => set("evidence", e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
          <span className="text-sm text-muted">
            {saving != null && saving > 0 ? (
              <>
                Saving: <strong className="text-good">{money(saving, f.currency || "EUR")}</strong> a year
                {fee ? ` · fee ${money(fee.gross, f.currency || "EUR")} before platform-fee credits` : ""}
              </>
            ) : saving != null ? (
              "The new price has to be lower than the baseline."
            ) : null}
          </span>
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
            <button type="submit" className={btnPrimary}>Record saving</button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function Stat({ label, value, strong, good }: { label: string; value: string; strong?: boolean; good?: boolean }) {
  return (
    <div className={cx("flex flex-col gap-1 rounded-[14px] border px-4 py-3.5", strong ? "border-brand-line bg-brand-soft" : "border-line bg-white")}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cx("font-display text-2xl font-semibold", good && "text-good")}>{value}</span>
    </div>
  );
}
