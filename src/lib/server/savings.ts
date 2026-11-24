import "server-only";
import type Stripe from "stripe";
import { lookupKey } from "@/lib/billing/plans";
import { feeBreakdown, FEE_CAP, FEE_RATE, INVOICE_DAYS, kindLabel, money, pct, type FeeStatus, type Saving } from "@/lib/billing/savings";
import { adminClient } from "./admin";
import { getBillingRowAdmin, getStripe, isBillingConfigured } from "./billing";

export const SAVINGS_SETUP = "Run supabase/migrations/20261124200000_savings_share.sql in the Supabase SQL editor first.";
export const savingsTableMissing = (msg: string) => /savings_ledger|schema cache/.test(msg);

export type SavingRow = {
  id: string;
  workspace_id: string;
  contract_id: string | null;
  review_id: string | null;
  new_contract_id: string | null;
  vendor: string;
  source: Saving["source"];
  kind: Saving["kind"];
  currency: string;
  baseline_annual: number | string;
  new_annual: number | string;
  annual_saving: number | string;
  baseline_note: string;
  evidence: string | null;
  signed_on: string | null;
  status: Saving["status"];
  recorded_by_email: string | null;
  recorded_at: string;
  confirmed_by_email: string | null;
  confirmed_at: string | null;
  dispute_note: string | null;
  fee_rate: number | string | null;
  fee_cap: number | string | null;
  fee_gross: number | string | null;
  credit_applied: number | string | null;
  fee_net: number | string | null;
  fee_status: FeeStatus;
  stripe_invoice_id: string | null;
  invoice_url: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
};

const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));

export function rowToSaving(r: SavingRow): Saving {
  return {
    id: r.id,
    contractId: r.contract_id,
    reviewId: r.review_id,
    newContractId: r.new_contract_id,
    vendor: r.vendor,
    source: r.source,
    kind: r.kind,
    currency: r.currency,
    baselineAnnual: Number(r.baseline_annual),
    newAnnual: Number(r.new_annual),
    annualSaving: Number(r.annual_saving),
    baselineNote: r.baseline_note,
    evidence: r.evidence,
    signedOn: r.signed_on,
    status: r.status,
    recordedByEmail: r.recorded_by_email,
    recordedAt: r.recorded_at,
    confirmedByEmail: r.confirmed_by_email,
    confirmedAt: r.confirmed_at,
    disputeNote: r.dispute_note,
    feeRate: num(r.fee_rate),
    feeCap: num(r.fee_cap),
    feeGross: num(r.fee_gross),
    creditApplied: num(r.credit_applied),
    feeNet: num(r.fee_net),
    feeStatus: r.fee_status,
    invoiceUrl: r.invoice_url,
    invoicedAt: r.invoiced_at,
    paidAt: r.paid_at,
  };
}

const YEAR_MS = 365 * 86_400_000;

/**
 * Platform fees (Savings plan) the workspace paid in the last 12 months that haven't been credited against a
 * savings fee yet, in one currency. Reads paid invoices from Stripe and the credits already used from the ledger.
 */
async function creditAvailable(stripe: Stripe, workspaceId: string, customerId: string, currency: string): Promise<number> {
  const db = adminClient();
  if (!db) return 0;
  const since = Math.floor((Date.now() - YEAR_MS) / 1000);
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey("savings", "month"), lookupKey("savings", "year")], limit: 10 });
  const savingsPrices = new Set(prices.data.map((p) => p.id));
  let paid = 0;
  for await (const inv of stripe.invoices.list({ customer: customerId, status: "paid", created: { gte: since }, limit: 100 })) {
    if (inv.currency.toUpperCase() !== currency) continue;
    for (const line of inv.lines.data) {
      const price = line.pricing?.price_details?.price;
      const priceId = typeof price === "string" ? price : price?.id;
      if (priceId && savingsPrices.has(priceId)) paid += line.amount / 100;
    }
  }
  const { data } = await db
    .from("savings_ledger")
    .select("credit_applied")
    .eq("workspace_id", workspaceId)
    .eq("currency", currency)
    .neq("status", "void")
    .gte("confirmed_at", new Date(Date.now() - YEAR_MS).toISOString());
  const used = (data ?? []).reduce((s, r) => s + (Number(r.credit_applied) || 0), 0);
  return Math.max(0, Math.round((paid - used) * 100) / 100);
}

export type InvoiceResult = { feeStatus: FeeStatus; message: string };

/**
 * Works out the fee for a confirmed saving and, on the Savings plan, invoices it through Stripe.
 * Writes the outcome to the ledger row. Never throws: a Stripe problem is saved as "failed" with a message,
 * and the admin can retry from the ledger.
 */
export async function billSaving(row: SavingRow): Promise<InvoiceResult> {
  const db = adminClient();
  if (!db) return { feeStatus: "failed", message: "SUPABASE_SERVICE_ROLE_KEY is missing." };
  const save = async (patch: Record<string, unknown>) => {
    await db.from("savings_ledger").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id);
  };

  const billing = await getBillingRowAdmin(row.workspace_id);
  const onSavingsPlan =
    isBillingConfigured() && !billing?.complimentary && billing?.plan === "savings" && ["active", "trialing", "past_due"].includes(billing?.status ?? "");
  const saving = Number(row.annual_saving);
  const rate = row.fee_rate != null ? Number(row.fee_rate) : FEE_RATE;
  const cap = row.fee_cap != null ? Number(row.fee_cap) : FEE_CAP;

  if (!onSavingsPlan) {
    await save({ fee_rate: null, fee_cap: null, fee_gross: 0, credit_applied: 0, fee_net: 0, fee_status: "not_billed" });
    return { feeStatus: "not_billed", message: "Recorded. This workspace is on a flat plan, so there is no savings fee." };
  }

  const stripe = getStripe();
  const customer = billing?.stripe_customer_id;
  if (!stripe || !customer) {
    await save({ fee_rate: rate, fee_cap: cap, fee_status: "failed" });
    return { feeStatus: "failed", message: "Stripe isn't set up for this workspace, so the fee couldn't be invoiced." };
  }

  try {
    const credit = await creditAvailable(stripe, row.workspace_id, customer, row.currency);
    const fee = feeBreakdown(saving, credit, rate, cap);
    const base = { fee_rate: rate, fee_cap: cap, fee_gross: fee.gross, credit_applied: fee.credit, fee_net: fee.net };
    if (fee.net <= 0) {
      await save({ ...base, fee_status: "credited" });
      return { feeStatus: "credited", message: `Confirmed. The ${money(fee.gross, row.currency)} fee is covered by platform fees you've already paid.` };
    }

    const cust = await stripe.customers.retrieve(customer);
    const hasCard = !("deleted" in cust && cust.deleted) && Boolean((cust as Stripe.Customer).invoice_settings?.default_payment_method);
    const sub = billing?.stripe_subscription_id ? await stripe.subscriptions.retrieve(billing.stripe_subscription_id).catch(() => null) : null;
    const charge = hasCard || Boolean(sub?.default_payment_method);
    const cur = row.currency.toLowerCase();
    const meta = { app: "contract-radar", kind: "savings_fee", savings_id: row.id, workspace_id: row.workspace_id };

    const invoice = await stripe.invoices.create({
      customer,
      currency: cur,
      collection_method: charge ? "charge_automatically" : "send_invoice",
      ...(charge ? {} : { days_until_due: INVOICE_DAYS }),
      ...(charge && sub?.default_payment_method
        ? { default_payment_method: typeof sub.default_payment_method === "string" ? sub.default_payment_method : sub.default_payment_method.id }
        : {}),
      auto_advance: true,
      pending_invoice_items_behavior: "exclude",
      automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
      description: `Outflow savings fee: ${row.vendor}`,
      metadata: meta,
    });
    await stripe.invoiceItems.create({
      customer,
      invoice: invoice.id,
      currency: cur,
      amount: Math.round(fee.gross * 100),
      description: `${pct(rate)} of ${money(saving, row.currency)} first-year saving on ${row.vendor} (${kindLabel(row.kind).toLowerCase()})${
        fee.gross < saving * rate ? `, capped at ${money(cap, row.currency)}` : ""
      }`,
      metadata: meta,
    });
    if (fee.credit > 0) {
      await stripe.invoiceItems.create({
        customer,
        invoice: invoice.id,
        currency: cur,
        amount: -Math.round(fee.credit * 100),
        description: "Platform fees paid in the last 12 months, credited",
        metadata: meta,
      });
    }
    const final = await stripe.invoices.finalizeInvoice(invoice.id!, { auto_advance: true });
    if (!charge) await stripe.invoices.sendInvoice(final.id!).catch(() => null);
    await save({
      ...base,
      fee_status: final.status === "paid" ? "paid" : "invoiced",
      stripe_invoice_id: final.id,
      invoice_url: final.hosted_invoice_url ?? null,
      invoiced_at: new Date().toISOString(),
      ...(final.status === "paid" ? { paid_at: new Date().toISOString() } : {}),
    });
    return {
      feeStatus: "invoiced",
      message: `Confirmed. Invoiced ${money(fee.net, row.currency)}${fee.credit > 0 ? ` after ${money(fee.credit, row.currency)} of platform fees were credited` : ""}.`,
    };
  } catch (e) {
    console.error("savings invoice failed", e);
    await save({ fee_rate: rate, fee_cap: cap, fee_status: "failed" });
    return { feeStatus: "failed", message: `Confirmed, but Stripe couldn't create the invoice: ${(e as Error).message}` };
  }
}

/** Webhook: a savings-fee invoice was paid, failed or was voided. Returns true when it was one of ours. */
export async function syncSavingsInvoice(invoice: Stripe.Invoice, type: string): Promise<boolean> {
  const id = invoice.metadata?.savings_id;
  if (!id || invoice.metadata?.kind !== "savings_fee") return false;
  const db = adminClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set.");
  const status: FeeStatus | null =
    type === "invoice.paid" ? "paid" : type === "invoice.payment_failed" ? "failed" : type === "invoice.voided" || type === "invoice.marked_uncollectible" ? "void" : null;
  if (!status) return true;
  const { error } = await db
    .from("savings_ledger")
    .update({
      fee_status: status,
      stripe_invoice_id: invoice.id,
      invoice_url: invoice.hosted_invoice_url ?? null,
      ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
