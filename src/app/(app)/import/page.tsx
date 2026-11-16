import { Suspense } from "react";
import { BulkImport } from "@/components/import/BulkImport";
import { PageHeader } from "@/components/ui";

export default function ImportPage() {
  return (
    <>
      <PageHeader eyebrow="Hundreds or thousands of contracts at once, read in the background" title="Bulk import" />
      <Suspense>
        <BulkImport />
      </Suspense>
    </>
  );
}
