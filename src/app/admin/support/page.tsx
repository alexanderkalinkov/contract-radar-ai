import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
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
  emailed: boolean;
  status: "open" | "resolved";
  note: string | null;
  resolved_at: string | null;
  resolved_by_email: string | null;
  created_at: string;
};

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const { status = "open" } = await searchParams;
  let query = ctx.db.from("support_requests").select("*").order("created_at", { ascending: false }).limit(200);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  const rows = (data ?? []) as Req[];

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Support messages" />
      {error ? (
        <SetupNeeded>Run <b>platform-admin.sql</b> in Supabase to keep support messages here. Until then they only arrive by email.</SetupNeeded>
      ) : (
        <>
          <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
            {[["open", "Open"], ["resolved", "Resolved"], ["all", "All"]].map(([v, l]) => (
              <Link key={v} href={`/admin/support?status=${v}`} aria-current={status === v ? "page" : undefined} className={status === v ? "rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-white" : "rounded-full bg-chip px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-line"}>
                {l}
              </Link>
            ))}
          </nav>
          {rows.length === 0 && <Card className="p-8 text-center text-sm text-muted">{status === "open" ? "No open messages. Nice." : "Nothing here."}</Card>}
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <Card key={r.id} label={`Message from ${r.email}`} className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <b>{r.topic ?? "Message"}</b>
                      <Pill tone={r.status === "open" ? "warn" : "good"}>{r.status === "open" ? "Open" : "Resolved"}</Pill>
                      {!r.emailed && <Pill tone="muted">Not emailed</Pill>}
                    </span>
                    <span className="text-sm text-ink-2">
                      {r.user_id ? <Link href={`/admin/users/${r.user_id}`} className="font-semibold text-ink">{r.name ? `${r.name} · ${r.email}` : r.email}</Link> : r.email}
                      {r.workspace_id && <> in <Link href={`/admin/workspaces/${r.workspace_id}`} className="font-semibold text-ink">{r.workspace_name ?? "workspace"}</Link></>}
                    </span>
                  </div>
                  <span className="text-xs text-muted" title={when(r.created_at)}>{ago(r.created_at)}</span>
                </div>
                <p className="m-0 text-sm whitespace-pre-wrap text-ink">{r.message}</p>
                {(r.page || r.attachment) && (
                  <span className="text-xs text-muted">{[r.page && `Page: ${r.page}`, r.attachment && `Attachment: ${r.attachment} (in the email)`].filter(Boolean).join(" · ")}</span>
                )}
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
            ))}
          </div>
        </>
      )}
    </>
  );
}
