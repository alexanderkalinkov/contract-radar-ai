import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingPlans } from "@/components/billing/BillingPlans";
import { PageHeader } from "@/components/ui";
import { getBilling, getPrices, isBillingConfigured, isTestMode } from "@/lib/server/billing";
import { getSession } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const [billing, prices, sp] = await Promise.all([getBilling(session.workspace.id), getPrices(), searchParams]);
  return (
    <>
      <PageHeader eyebrow="Plan, trial and invoices for this workspace" title="Billing" />
      <BillingPlans
        billing={billing}
        prices={prices}
        isAdmin={session.role === "owner"}
        configured={isBillingConfigured()}
        testMode={isTestMode()}
        checkout={sp.checkout === "success" ? "success" : sp.checkout === "canceled" ? "canceled" : null}
      />
      <p className="m-0 mt-6 text-sm text-muted">
        Subscriptions are covered by our{" "}
        <Link href="/legal/terms" className="text-brand underline underline-offset-2">Terms of service</Link> and{" "}
        <Link href="/legal/dpa" className="text-brand underline underline-offset-2">Data processing agreement</Link>. See how we handle data in
        the <Link href="/legal/privacy" className="text-brand underline underline-offset-2">Privacy policy</Link> and the list of{" "}
        <Link href="/legal/subprocessors" className="text-brand underline underline-offset-2">subprocessors</Link>.
      </p>
    </>
  );
}
