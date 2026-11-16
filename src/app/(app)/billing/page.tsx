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
    </>
  );
}
