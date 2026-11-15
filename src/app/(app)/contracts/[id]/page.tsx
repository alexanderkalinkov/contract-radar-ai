import { CONTRACTS, getContract } from "@/lib/seed";
import { ContractDetail } from "@/components/ContractDetail";
import { SavedContractPage } from "@/components/SavedContractPage";

export function generateStaticParams() {
  return CONTRACTS.map((c) => ({ id: c.id }));
}

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sample = getContract(id);
  if (sample) return <ContractDetail contract={sample} />;
  // Anything else is a contract the team uploaded; it loads from the workspace (or this browser in demo mode).
  return <SavedContractPage id={id} />;
}
