import Link from "next/link";
import { notFound } from "next/navigation";
import type Stripe from "stripe";
import { Card, H2, PageHeader } from "@/components/ui";
import { ActionButton, RenameWorkspace, RoleSelect, TrialExtender } from "@/components/admin/AdminUi";
import { ago, BillingPill, day, Pill, when } from "@/components/admin/bits";
import { parseRole, roleLabel } from "@/lib/roles";
import { getBillingRowAdmin, getStripe, isBillingConfigured, summarize } from "@/lib/server/billing";
import { getPlatformCtx } from "@/lib/server/platform";
import { stripeDashboardUrl } from "@/lib/server/platform-data";

export const dynamic = "force-dynamic";

type Member = { user_id: string; email: string; role: string; created_at: string; job_title?: string | null };
type Invite = { id: string; email: string; role: string | null; created_at: string };
type AuditRow = { id: number; actor_email: string | null; action: string; target_label: string | null; created_at: string };

async function stripeSub(id: string | null): Promise<{ sub: Stripe.Subscription | null; error: string | null }> {
  const stripe = getStripe();
  if (!stripe || !id) return { sub: null, error: null };
  try {
    return { sub: await stripe.subscriptions.retrieve(id, { expand: ["latest_invoice"] }), error: null };
  } catch (e) {
    return { sub: null, error: (e as Error).message };
  }
}

export default async function AdminWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const { id } = await params;
  const { db } = ctx;
  const { data: ws } = await db.from("workspaces").select("*").eq("id", id).maybeSingle();
  if (!ws) notFound();

  const [members, invites, contracts, audit, billingRow] = await Promise.all([
    db.from("workspace_members").select("*").eq("workspace_id", id).order("created_at"),
    db.from("workspace_invites").select("id, email, role, created_at").eq("workspace_id", id).order("created_at"),
    db.from("contracts").select("id", { head: true, count: "exact" }).eq("workspace_id", id),
    db.from("audit_log").select("id, actor_email, action, target_label, created_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(15),
    isBillingConfigured() ? getBillingRowAdmin(id) : Promise.resolve(null),
  ]);
  const billing = isBillingConfigured() ? summarize(billingRow) : null;
  const { sub, error: stripeError } = await stripeSub(billingRow?.stripe_subscription_id ?? null);
  const item = sub?.items.data[0];
  const price = item?.price;
  const invoice = sub?.latest_invoice && typeof sub.latest_invoice !== "string" ? sub.latest_invoice : null;
  const money = (cents: number | null | undefined, cur?: string | null) =>
    cents == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: (cur ?? "eur").toUpperCase() }).format(cents / 100);

  return (
    <>
      <Link href="/admin/workspaces" className="text-sm font-semibold text-brand">← All workspaces</Link>
      <PageHeader eyebrow="Workspace" title={ws.name}>
        {ws.is_demo && <Pill tone="warn">Demo workspace</Pill>}
        <BillingPill billing={billing} />
        <Link href={`/admin/setup?q=${id}#errors`} className="text-sm font-semibold text-brand">Errors</Link>
        <Link href={`/admin/support?status=all&q=${id}`} className="text-sm font-semibold text-brand">Support messages</Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card label="Workspace" className="flex flex-col gap-4 p-5">
          <H2>Workspace</H2>
          <RenameWorkspace workspaceId={id} name={ws.name} />
          <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Created</dt><dd className="m-0">{when(ws.created_at)}</dd>
            <dt className="text-muted">Contracts</dt><dd className="m-0">{contracts.count ?? 0}</dd>
            <dt className="text-muted">People</dt><dd className="m-0">{(members.data ?? []).length} members, {(invites.data ?? []).length} pending invites</dd>
            <dt className="text-muted">Company size</dt><dd className="m-0">{ws.company_size ?? "—"}</dd>
            <dt className="text-muted">Setup finished</dt><dd className="m-0">{ws.onboarded_at ? day(ws.onboarded_at) : "Not yet"}</dd>
            <dt className="text-muted">Renewal reminders</dt>
            <dd className="m-0 flex flex-wrap items-center gap-2">
              {ws.renewal_alerts === false ? "Off" : "On"}
              <ActionButton payload={{ action: "workspace.alerts", workspaceId: id, on: ws.renewal_alerts === false }} label={ws.renewal_alerts === false ? "Switch on" : "Switch off"} />
            </dd>
            <dt className="text-muted">Id</dt><dd className="m-0"><code className="text-xs break-all">{id}</code></dd>
          </dl>
        </Card>

        <Card label="Subscription" className="flex flex-col gap-4 p-5">
          <H2>Subscription</H2>
          {!billing ? (
            <p className="m-0 text-sm text-muted">Billing is off (no STRIPE_SECRET_KEY, or billing.sql hasn&apos;t been run).</p>
          ) : (
            <>
              <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">State</dt><dd className="m-0"><BillingPill billing={billing} /></dd>
                <dt className="text-muted">Trial ends</dt><dd className="m-0">{day(billingRow?.trial_ends_at)}</dd>
                {billingRow?.stripe_subscription_id && (
                  <>
                    <dt className="text-muted">Stripe status</dt><dd className="m-0">{sub?.status ?? billingRow.status ?? "—"}{sub?.cancel_at_period_end ? " (cancels at period end)" : ""}</dd>
                    <dt className="text-muted">Price</dt><dd className="m-0">{price ? `${money(price.unit_amount, price.currency)} / ${price.recurring?.interval ?? "—"}${item?.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ""}` : "—"}</dd>
                    <dt className="text-muted">Current period ends</dt><dd className="m-0">{day(billingRow.current_period_end)}</dd>
                    {sub?.trial_end && <><dt className="text-muted">Stripe trial ends</dt><dd className="m-0">{day(new Date(sub.trial_end * 1000).toISOString())}</dd></>}
                    {invoice && <><dt className="text-muted">Latest invoice</dt><dd className="m-0">{money(invoice.amount_due, invoice.currency)} · {invoice.status}{invoice.hosted_invoice_url && <> · <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer" className="font-semibold text-brand">view</a></>}</dd></>}
                  </>
                )}
                {stripeError && <><dt className="text-muted">Stripe</dt><dd className="m-0 text-[#B42318]">{stripeError}</dd></>}
              </dl>
              <div className="flex flex-wrap gap-2">
                {billingRow?.stripe_customer_id && (
                  <a href={stripeDashboardUrl("customers", billingRow.stripe_customer_id)} target="_blank" rel="noreferrer" className="cr-press inline-flex min-h-9 items-center rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-[13px] font-semibold text-ink hover:bg-[#EEF2F7]">
                    Open in Stripe ↗
                  </a>
                )}
                {billingRow?.complimentary ? (
                  <ActionButton payload={{ action: "billing.comp", workspaceId: id, on: false }} label="Remove free forever" confirm="They go back to trial or paid?" tone="danger" />
                ) : (
                  <ActionButton payload={{ action: "billing.comp", workspaceId: id, on: true }} label="Make free forever" confirm="Give full access with no charge?" tone="brand" />
                )}
                {billingRow?.stripe_subscription_id && (
                  <>
                    <ActionButton payload={{ action: "billing.sync", workspaceId: id }} label="Sync from Stripe" />
                    {sub?.status !== "canceled" &&
                      (sub?.cancel_at_period_end ? (
                        <ActionButton payload={{ action: "billing.resume", workspaceId: id }} label="Undo cancellation" tone="brand" />
                      ) : (
                        <ActionButton payload={{ action: "billing.cancel", workspaceId: id, when: "period_end" }} label="Cancel at period end" confirm="Stop renewing?" tone="danger" />
                      ))}
                    {sub?.status !== "canceled" && (
                      <ActionButton payload={{ action: "billing.cancel", workspaceId: id, when: "now" }} label="Cancel now" confirm="End it immediately, no refund?" tone="danger" />
                    )}
                  </>
                )}
              </div>
              {!billingRow?.complimentary && (billing.state !== "active" || sub?.status === "trialing") && billing.state !== "past_due" && <TrialExtender workspaceId={id} />}
              <p className="m-0 text-xs text-muted">Plan changes, refunds and card updates happen in Stripe (Open in Stripe) or by the customer on their Billing page.</p>
            </>
          )}
        </Card>
      </div>

      <Card label="People" className="rtable-wrap overflow-x-auto">
        <div className="px-5 pt-5"><H2>People</H2></div>
        <table className="rtable w-full min-w-[720px] border-collapse text-sm">
          <tbody>
            {((members.data ?? []) as Member[]).map((m) => (
              <tr key={m.user_id} className="border-t border-line-soft first:border-t-0">
                <td className="rt-full px-5 py-3">
                  <Link href={`/admin/users/${m.user_id}`} className="font-semibold text-ink">{m.email}</Link>
                  {m.job_title && <span className="block text-xs text-muted">{m.job_title}</span>}
                </td>
                <td data-label="Role" className="px-3 py-3"><RoleSelect workspaceId={id} userId={m.user_id} role={parseRole(m.role)} /></td>
                <td data-label="Joined" className="px-3 py-3 text-ink-2">{day(m.created_at)}</td>
                <td className="rt-end px-5 py-3 text-right">
                  <ActionButton payload={{ action: "member.remove", workspaceId: id, userId: m.user_id }} label="Remove" confirm="Remove from workspace?" tone="danger" />
                </td>
              </tr>
            ))}
            {((invites.data ?? []) as Invite[]).map((i) => (
              <tr key={i.id} className="border-t border-line-soft">
                <td className="rt-full px-5 py-3">
                  <span className="font-semibold text-ink-2">{i.email}</span> <Pill tone="warn">Invited</Pill>
                </td>
                <td data-label="Role" className="px-3 py-3 text-ink-2">{roleLabel(parseRole(i.role))}</td>
                <td data-label="Invited" className="px-3 py-3 text-ink-2">{ago(i.created_at)}</td>
                <td className="rt-end px-5 py-3 text-right">
                  <span className="inline-flex flex-wrap justify-end gap-2">
                    <ActionButton payload={{ action: "invite.resend", inviteId: i.id }} label="Resend" />
                    <ActionButton payload={{ action: "invite.cancel", inviteId: i.id }} label="Cancel" confirm="Cancel invite?" tone="danger" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card label="Recent activity" className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <H2>Recent activity</H2>
          <Link href={`/admin/audit?ws=${id}`} className="text-sm font-semibold text-brand">Full log</Link>
        </div>
        {((audit.data ?? []) as AuditRow[]).length === 0 ? (
          <p className="m-0 text-sm text-muted">Nothing logged yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0 text-sm">
            {((audit.data ?? []) as AuditRow[]).map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span><b>{a.action}</b>{a.target_label && <span className="text-ink-2"> · {a.target_label}</span>} <span className="text-muted">by {a.actor_email ?? "system"}</span></span>
                <span className="text-xs text-muted">{when(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
