import { notFound } from "next/navigation";
import { CONTRACTS, getContract } from "@/lib/seed";
import { ContractDetail } from "@/components/ContractDetail";

export function generateStaticParams() {
  return CONTRACTS.map((c) => ({ id: c.id }));
}

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = getContract(id);
  if (!contract) notFound();
  return <ContractDetail contract={contract} />;
}
