import Link from "next/link";
import { notFound } from "next/navigation";
import { btnGhost, Card, PageHeader } from "@/components/ui";
import { ActionButton, SupportResolve } from "@/components/admin/AdminUi";
import { ago, Pill, SetupNeeded, when } from "@/components/admin/bits";
import { getPlatformCtx } from "@/lib/server/platform";

export const dynamic = "force-dynamic";

type Req = {
  id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  topic: string | null;
  message: string;
  page: string | null;
  attachment: string | null;
  attachment_path?: string | null;
  role?: string | null;
  plan?: string | null;
  is_demo?: boolean | null;
  browser?: string | null;
  errors?: string[] | null;
  emailed: boolean;
  status: "open" | "resolved";
  note: string | null;
  resolved_at: string | null;
  resolved_by_email: string | null;
  created_at: string;
};

const clean = (s: string) => s.replace(/[%,()*]/g, "").trim().slice(0, 80);

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const q = clean(sp.q ?? "");
  let query = ctx.db.from("support_requests").select("*").order("created_at", { ascending: false }).limit(200);
  if (status !== "all") query = query.eq("status", status);
  if (q) {
    query = /^[0-9a-f-]{36}$/i.test(q)
      ? query.or(`id.eq.${q},user_id.eq.${q},workspace_id.eq.${q}`)
      : query.or(`email.ilike.%${q}%,message.ilike.%${q}%,workspace_name.ilike.%${q}%,topic.ilike.%${q}%`);
  }
  const { data, error } = await query;
  const rows = (data ?? []) as Req[];

  // Short-lived links to attachments in the private "support" bucket.
  const links = new Map<string, string>();
  await Promise.all(
    rows
      .filter((r) => r.attachment_path)
      .map(async (r) => {
        const { data: signed } = await ctx.db.storage.from("support").createSignedUrl(r.attachment_path!, 3600);
        if (signed?.signedUrl) links.set(r.id, signed.signedUrl);
      }),
  );

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Support messages" />
      {error ? (
        <SetupNeeded>Run <b>platform-admin.sql</b> in Supabase to keep support messages here. Until then they only arrive by email.</SetupNeeded>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
              {[["open", "Open"], ["resolved", "Resolved"], ["all", "All"]].map(([v, l]) => (
                <Link key={v} href={`/admin/support?status=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={status === v ? "page" : undefined} className={status === v ? "rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-white" : "rounded-full bg-chip px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-line"}>
                  {l}
                </Link>
              ))}
            </nav>
            <form action="/admin/support" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="status" value={status} />
              <input name="q" defaultValue={q} placeholder="Email, text or any id" aria-label="Search support messages" className="min-h-10 w-64 rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm" />
              <button type="submit" className={btnGhost}>Search</button>
            </form>
          </div>
          {rows.length === 0 && <Card className="p-8 text-center text-sm text-muted">{status === "open" && !q ? "No open messages. Nice." : "Nothing here."}</Card>}
          <div className="flex flex-col gap-3">
            {rows.map((r) => {
              const facts: [string, React.ReactNode][] = [
                ["From", r.user_id ? <Link key="u" href={`/admin/users/${r.user_id}`} className="font-semibold text-brand">{r.name ? `${r.name} · ${r.email}` : r.email}</Link> : `${r.email} (signed out)`],
                ["Workspace", r.workspace_id ? (
                  <span key="w">
                    <Link href={`/admin/workspaces/${r.workspace_id}`} className="font-semibold text-brand">{r.workspace_name ?? "workspace"}</Link>
                    {r.role && ` · ${r.role}`}
                    {r.is_demo && " · demo"}
                    <code className="block text-xs text-muted">{r.workspace_id}</code>
                  </span>
                ) : "—"],
                ["Plan", r.plan || "—"],
                ["Page", r.page || "—"],
                ["Browser", r.browser || "—"],
                ["User id", r.user_id ? <code key="id" className="text-xs">{r.user_id}</code> : "—"],
                ["Sent", when(r.created_at)],
                ["Message id", <code key="mid" className="text-xs">{r.id}</code>],
              ];
              const errs = Array.isArray(r.errors) ? r.errors : [];
              return (
                <Card key={r.id} label={`Message from ${r.email}`} className="flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="text-xs tracking-wide text-brand uppercase">{r.topic ?? "Message"}</b>
                      <Pill tone={r.status === "open" ? "warn" : "good"}>{r.status === "open" ? "Open" : "Resolved"}</Pill>
                      {!r.emailed && <Pill tone="muted">Not emailed</Pill>}
                    </span>
                    <span className="text-xs text-muted" title={when(r.created_at)}>{ago(r.created_at)}</span>
                  </div>
                  <p className="m-0 rounded-xl border border-brand-line bg-brand-soft px-4 py-3 text-sm whitespace-pre-wrap text-ink">{r.message}</p>
                  <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    {facts.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted">{k}</dt>
                        <dd className="m-0 break-words text-ink">{v}</dd>
                      </div>
                    ))}
                    <dt className="text-muted">Attachment</dt>
                    <dd className="m-0">
                      {r.attachment ? (
                        links.get(r.id) ? (
                          <a href={links.get(r.id)} target="_blank" rel="noreferrer" className="font-semibold text-brand">{r.attachment} ↗</a>
                        ) : (
                          <span>{r.attachment} <span className="text-muted">(in the email)</span></span>
                        )
                      ) : (
                        "—"
                      )}
                    </dd>
                    <dt className="text-muted">Recent errors</dt>
                    <dd className="m-0">
                      {errs.length ? (
                        <ul className="m-0 flex list-none flex-col gap-1 p-0">
                          {errs.map((e, i) => <li key={i}><code className="text-xs break-all text-[#912018]">{e}</code></li>)}
                        </ul>
                      ) : (
                        <span className="text-muted">None on their tab</span>
                      )}
                      {r.user_id && <Link href={`/admin/setup?q=${r.user_id}#errors`} className="mt-1 block text-xs font-semibold text-brand">All logged errors for this person</Link>}
                    </dd>
                  </dl>
                  <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                    <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.topic ?? "your message"}`)}`} className="cr-press inline-flex min-h-9 items-center rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-[13px] font-semibold text-ink hover:bg-[#EEF2F7]">
                      Reply by email
                    </a>
                    {r.status === "open" ? (
                      <div className="min-w-[260px] flex-1"><SupportResolve id={r.id} /></div>
                    ) : (
                      <>
                        <span className="text-xs text-muted">Resolved by {r.resolved_by_email ?? "—"} {ago(r.resolved_at)}{r.note ? ` · ${r.note}` : ""}</span>
                        <ActionButton payload={{ action: "support.reopen", id: r.id }} label="Reopen" />
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
