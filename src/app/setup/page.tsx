"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, IconUpload } from "@/components/icons";
import { btnGhost, btnPrimary, Card, cx, H2 } from "@/components/ui";
import { DepartmentSelect, inputCls, labelCls, Notice } from "@/components/team/forms";
import { TeamError } from "@/components/team/TeamError";
import { usd } from "@/lib/format";
import { COMPANY_SIZES, guessCategory, PRESET_DEPARTMENTS } from "@/lib/team/types";
import { useTeam } from "@/lib/team/useTeam";
import { ConnectionCards, DiscoveryReview, useConnectResult } from "@/components/discovery/Discovery";
import { useDiscovery } from "@/lib/discovery/useDiscovery";

const STEPS = ["Company", "Connect", "Departments", "Invite owners", "Add tools", "Done"];

export default function SetupPage() {
  const router = useRouter();
  const team = useTeam();
  const { raw, isAdmin, run } = team;
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const disc = useDiscovery();
  const [connectMsg, setConnectMsg] = useConnectResult();

  // Coming back from a provider's sign-in page: reopen the step we left.
  useEffect(() => {
    const s = Number(new URL(window.location.href).searchParams.get("step"));
    if (s >= 0 && s < STEPS.length) setStep(s);
  }, []);

  // Step 1
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [title, setTitle] = useState("");
  // Step 3
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  // Step 4
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [adminEmail, setAdminEmail] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  // Step 5
  const [toolName, setToolName] = useState("");
  const [toolDept, setToolDept] = useState<string | null>(null);
  const [toolCost, setToolCost] = useState("");
  const [toolSeats, setToolSeats] = useState("");

  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!raw || loaded) return;
    setName(raw.workspace.name);
    setSize(raw.workspace.company_size ?? "");
    setTitle(raw.me.job_title ?? "");
    setPicked(raw.departments.map((d) => d.name));
    setLoaded(true);
  }, [raw, loaded]);

  if (team.error) return <Shell><TeamError message={team.error} /></Shell>;
  if (!raw) return <Shell><p className="text-muted">Loading…</p></Shell>;
  if (!isAdmin) {
    return (
      <Shell>
        <Card label="Admins only" className="p-5 text-sm">
          Setup is run by your company&apos;s admin. Your part is on{" "}
          <Link href="/tools" className="font-semibold text-brand">Tools &amp; survey</Link>.
        </Card>
      </Shell>
    );
  }

  const go = (n: number) => {
    setMsg(null);
    setStep(n);
    window.scrollTo({ top: 0 });
  };
  const fail = (e?: string) => setMsg({ ok: false, text: e ?? "Something went wrong." });

  async function saveCompany() {
    setBusy(true);
    const r = await run({ op: "setup", name, company_size: size || null, job_title: title || null });
    setBusy(false);
    if (r.ok) go(1);
    else fail(r.error);
  }

  async function saveDepartments() {
    const names = Array.from(new Set(picked));
    if (!names.length) return fail("Pick at least one department.");
    setBusy(true);
    const r = await run({ op: "addDepartments", names });
    setBusy(false);
    if (r.ok) go(3);
    else fail(r.error);
  }

  async function sendInvites() {
    setBusy(true);
    const notes: string[] = [];
    const done: string[] = [];
    let failed = false;
    for (const d of raw!.departments) {
      const email = (emails[d.id] ?? "").trim();
      if (!email) continue;
      const r = await run({ op: "invite", email, department_id: d.id, role: "member" });
      if (!r.ok) {
        failed = true;
        notes.push(`${email}: ${r.error}`);
      } else {
        done.push(email);
        if (!r.emailed && r.emailNote) notes.push(`${email}: ${r.emailNote}`);
      }
    }
    if (adminEmail.trim()) {
      const r = await run({ op: "invite", email: adminEmail.trim(), department_id: null, role: "owner" });
      if (!r.ok) {
        failed = true;
        notes.push(`${adminEmail}: ${r.error}`);
      } else {
        done.push(adminEmail.trim());
        if (!r.emailed && r.emailNote) notes.push(`${adminEmail}: ${r.emailNote}`);
      }
    }
    setBusy(false);
    setSent((s) => [...s, ...done]);
    setEmails({});
    setAdminEmail("");
    if (failed || notes.length) setMsg({ ok: !failed, text: notes.join(" ") });
    else go(4);
  }

  async function addTool() {
    if (!toolName.trim()) return;
    setBusy(true);
    const r = await run({
      op: "addTool",
      tool: {
        name: toolName.trim(),
        category: guessCategory(toolName),
        department_id: toolDept,
        annual_cost: toolCost ? Number(toolCost.replace(/[^0-9.]/g, "")) : null,
        seats: toolSeats ? Number(toolSeats) : null,
      },
    });
    setBusy(false);
    if (!r.ok) return fail(r.error);
    setMsg(null);
    setToolName("");
    setToolCost("");
    setToolSeats("");
  }

  async function finish() {
    setBusy(true);
    const r = await run({ op: "setup", onboarded: true });
    setBusy(false);
    if (r.ok) router.push("/insights");
    else fail(r.error);
  }

  const invitesByDept = (id: string) => [
    ...raw.members.filter((m) => m.department_id === id).map((m) => m.email),
    ...raw.invites.filter((i) => i.department_id === id).map((i) => `${i.email} (invited)`),
  ];
  const myTools = raw.tools.filter((t) => !t.sample);

  return (
    <Shell>
      <ol className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === step ? "step" : undefined}
              className={cx(
                "min-h-9 rounded-full px-3 text-[13px] font-semibold",
                i === step ? "bg-brand text-white" : i < step ? "bg-brand-soft text-brand-dark" : "bg-chip text-muted",
              )}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card label="Company" className="flex flex-col gap-5 p-6">
          <Intro title="Set up your company" sub="About 10 minutes. You can change anything later." />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="co" className={labelCls}>Company / workspace name</label>
              <input id="co" className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="size" className={labelCls}>Employees</label>
              <select id="size" className={inputCls} value={size} onChange={(e) => setSize(e.target.value)}>
                <option value="">Choose…</option>
                {COMPANY_SIZES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor="title" className={labelCls}>Your role (budget owner)</label>
              <input id="title" className={inputCls} value={title} maxLength={80} placeholder="e.g. CFO" onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <Nav busy={busy} onNext={saveCompany} />
        </Card>
      )}

      {step === 1 && (
        <Card label="Connect" className="flex flex-col gap-5 p-6">
          <Intro
            title="Connect accounting and sign-in"
            sub="Radar pulls a draft list of every tool you pay for (QuickBooks or Xero) and who uses it (Google Workspace or Microsoft). After you add departments, each tool is filed under the team that uses it."
          />
          <ConnectionCards disc={disc} returnTo="/setup?step=1" onMessage={setConnectMsg} />
          <Notice msg={connectMsg} />
          <Nav
            busy={busy}
            onBack={() => go(0)}
            onNext={() => go(2)}
            nextLabel={disc.data?.connections.length ? "Continue" : "Continue without connecting"}
          />
        </Card>
      )}

      {step === 2 && (
        <Card label="Departments" className="flex flex-col gap-5 p-6">
          <Intro title="Which departments buy software?" sub="Each one gets an owner who confirms its tools and answers a short survey." />
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set([...PRESET_DEPARTMENTS, ...picked])).map((d) => {
              const on = picked.includes(d);
              const existing = raw.departments.some((x) => x.name === d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  disabled={existing}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== d) : [...picked, d])}
                  className={cx(
                    "min-h-11 rounded-full border px-4 text-sm font-semibold",
                    on ? "border-brand bg-brand text-white" : "border-[#D0D5DD] bg-white text-ink hover:bg-[#EEF2F7]",
                    existing && "opacity-80",
                  )}
                >
                  {on ? "✓ " : "+ "}
                  {d}
                </button>
              );
            })}
          </div>
          <form
            className="flex flex-wrap gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              const c = custom.trim();
              if (c && !picked.includes(c)) setPicked([...picked, c]);
              setCustom("");
            }}
          >
            <label htmlFor="custom" className="sr-only">Another department</label>
            <input id="custom" className={`${inputCls} max-w-[300px]`} placeholder="Another department" value={custom} maxLength={60} onChange={(e) => setCustom(e.target.value)} />
            <button type="submit" className={btnGhost} disabled={!custom.trim()}>Add</button>
          </form>
          <Notice msg={msg} />
          <Nav busy={busy} onBack={() => go(1)} onNext={saveDepartments} />
        </Card>
      )}

      {step === 3 && (
        <Card label="Invite owners" className="flex flex-col gap-5 p-6">
          <Intro
            title="Invite one owner per department"
            sub="They get an email with a link that signs them in and shows the tools filed under their department."
          />
          {raw.departments.length === 0 && <p className="m-0 text-sm text-warn">Add departments in the previous step first.</p>}
          <div className="flex flex-col gap-3">
            {raw.departments.map((d) => {
              const already = invitesByDept(d.id);
              return (
                <div key={d.id} className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
                  <label htmlFor={`e-${d.id}`} className="text-sm font-semibold">{d.name}</label>
                  <div className="flex flex-col gap-1">
                    <input
                      id={`e-${d.id}`}
                      type="email"
                      className={inputCls}
                      placeholder={`${d.name.toLowerCase().replace(/[^a-z]/g, "")}-lead@company.com`}
                      value={emails[d.id] ?? ""}
                      onChange={(e) => setEmails({ ...emails, [d.id]: e.target.value })}
                    />
                    {already.length > 0 && <span className="text-[13px] text-muted">Already: {already.join(", ")}</span>}
                  </div>
                </div>
              );
            })}
            <div className="grid items-center gap-2 border-t border-line-soft pt-3 sm:grid-cols-[180px_1fr]">
              <label htmlFor="e-admin" className="text-sm font-semibold">Another admin (optional)</label>
              <input id="e-admin" type="email" className={inputCls} placeholder="ceo@company.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
            </div>
          </div>
          {sent.length > 0 && <p className="m-0 text-sm text-good-dark">Invited: {sent.join(", ")}</p>}
          <Notice msg={msg} />
          <Nav
            busy={busy}
            onBack={() => go(2)}
            onNext={Object.values(emails).some((e) => e.trim()) || adminEmail.trim() ? sendInvites : () => go(4)}
            nextLabel={Object.values(emails).some((e) => e.trim()) || adminEmail.trim() ? "Send invites" : "Skip for now"}
          />
        </Card>
      )}

      {step === 4 && (
        <Card label="Add tools" className="flex flex-col gap-5 p-6">
          <Intro
            title="Get the tool list started"
            sub="Department owners will fill in the rest. Add a few you know about, or upload contracts and Claude reads the terms."
          />
          {(disc.items?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-brand-line bg-brand-soft/40 p-4">
              <DiscoveryReview disc={disc} compact />
            </div>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Link href="/upload" className={btnGhost}><IconUpload /> Upload contracts</Link>
            {!(disc.items?.length) && (
              <button type="button" className={btnGhost} onClick={() => go(1)}>Connect accounting or sign-in</button>
            )}
          </div>
          <form
            className="grid gap-2.5 sm:grid-cols-[2fr_1.5fr_1fr_0.8fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              addTool();
            }}
          >
            <label className="sr-only" htmlFor="tn">Tool</label>
            <input id="tn" className={inputCls} placeholder="Tool, e.g. Slack" value={toolName} onChange={(e) => setToolName(e.target.value)} />
            <label className="sr-only" htmlFor="td">Department</label>
            <DepartmentSelect id="td" value={toolDept} onChange={setToolDept} departments={raw.departments} />
            <label className="sr-only" htmlFor="tc">Annual cost</label>
            <input id="tc" className={inputCls} inputMode="decimal" placeholder="$ / year" value={toolCost} onChange={(e) => setToolCost(e.target.value)} />
            <label className="sr-only" htmlFor="ts">Seats</label>
            <input id="ts" className={inputCls} type="number" min={0} placeholder="Seats" value={toolSeats} onChange={(e) => setToolSeats(e.target.value)} />
            <button type="submit" className={btnPrimary} disabled={busy || !toolName.trim()}>Add</button>
          </form>
          {myTools.length > 0 && (
            <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
              {myTools.map((t) => (
                <li key={t.id} className="flex justify-between gap-3 py-2">
                  <span><span className="font-semibold">{t.name}</span> <span className="text-muted">· {raw.departments.find((d) => d.id === t.department_id)?.name ?? "Unassigned"}</span></span>
                  <span className="text-muted">{t.annual_cost != null ? usd(t.annual_cost) : ""}</span>
                </li>
              ))}
            </ul>
          )}
          <Notice msg={msg} />
          <Nav busy={busy} onBack={() => go(3)} onNext={() => go(5)} />
        </Card>
      )}

      {step === 5 && (
        <Card label="Done" className="flex flex-col gap-5 p-6">
          <Intro title="You're set up" sub="Here's what happens next." />
          <ol className="m-0 flex flex-col gap-2 pl-5 text-sm text-ink-2">
            <li>Department owners open their invite, confirm their tools and answer 4 questions per tool.</li>
            <li>Your leadership view fills in: overlaps between teams, low-value tools, and a recommendation for each renewal.</li>
            <li>A month before each renewal we flag the tool so the owner re-checks their answers.</li>
          </ol>
          <p className="m-0 text-sm">
            While you wait, your first savings are already on the <Link href="/" className="font-semibold text-brand">Savings</Link> page from any contracts you uploaded.
          </p>
          <Notice msg={msg} />
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className={btnPrimary} disabled={busy} onClick={finish}>Open the leadership view</button>
            <button type="button" className={btnGhost} onClick={() => go(4)}>Back</button>
          </div>
        </Card>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-navy px-4 py-4 text-white sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <Logo />
          <span className="font-display text-lg font-bold">Contract Radar</span>
        </Link>
        <Link href="/" className="min-h-9 text-[13px] font-semibold text-navy-text hover:text-white">Exit setup</Link>
      </header>
      <main className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-4 pt-8 pb-14 sm:px-8">{children}</main>
    </div>
  );
}

function Intro({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <H2 className="text-[24px]">{title}</H2>
      <p className="m-0 text-sm text-ink-2">{sub}</p>
    </div>
  );
}

function Nav({ busy, onBack, onNext, nextLabel = "Continue" }: { busy: boolean; onBack?: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <button type="button" className={btnPrimary} disabled={busy} onClick={onNext}>
        {busy ? "Saving…" : nextLabel}
      </button>
      {onBack && (
        <button type="button" className={btnGhost} onClick={onBack}>
          Back
        </button>
      )}
    </div>
  );
}
