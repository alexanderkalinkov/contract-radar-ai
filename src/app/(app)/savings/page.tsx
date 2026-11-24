import { SavingsLedger } from "@/components/billing/SavingsLedger";
import { PageHeader } from "@/components/ui";

export default function SavingsPage() {
  return (
    <>
      <PageHeader eyebrow="Every saving Outflow helped you make, with its baseline, evidence and sign-off" title="Realized savings" />
      <SavingsLedger />
    </>
  );
}
