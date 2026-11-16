import { BillingGate } from "@/components/billing/BillingGate";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ErrorTrail } from "@/components/help/ErrorTrail";
import { TourModal } from "@/components/help/Tour";
import { getSession } from "@/lib/server/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.ssoRequired) redirect("/auth/sso-required");
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-1 flex-col gap-6 px-4 pt-7 pb-12 sm:px-8">
        <BillingGate>{children}</BillingGate>
      </main>
      <TourModal />
      <ErrorTrail />
    </div>
  );
}
