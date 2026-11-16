import Link from "next/link";
import { ImportReview } from "@/components/import/ImportReview";
import { PageHeader } from "@/components/ui";

export default async function ImportJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHeader eyebrow="Check what Claude found, then add it to Contracts" title="Review import">
        <Link href="/import" className="text-sm font-semibold text-brand hover:underline">← All imports</Link>
      </PageHeader>
      <ImportReview id={id} />
    </>
  );
}
