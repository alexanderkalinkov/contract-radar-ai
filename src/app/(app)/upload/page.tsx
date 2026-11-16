import Link from "next/link";
import { InboxHint } from "@/components/EmailInboxCard";
import { PageHeader } from "@/components/ui";
import { Uploader } from "@/components/Uploader";
import { WriteOnly } from "@/components/WriteOnly";

export default function UploadPage() {
  return (
    <>
      <PageHeader eyebrow="Claude reads the contract and quotes the clause behind every number" title="Upload a contract" />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
<WriteOnly
            fallback={
              <p className="m-0 rounded-[14px] border border-line bg-white p-5 text-sm text-ink-2">
                You have read-only access to this workspace, so you can&apos;t upload contracts. Ask an admin to change your role on the Team page.
              </p>
            }
          >
            <Uploader />
            <InboxHint />
            <p className="m-0 text-[13px] text-muted">
              Hundreds of contracts in a folder, a ZIP, Google Drive or SharePoint?{" "}
              <Link href="/import" className="font-semibold text-brand hover:underline">Bulk import them</Link>.
            </p>
          </WriteOnly>
        </div>
        <aside className="flex flex-[1_1_280px] flex-col gap-3 rounded-[14px] border border-line bg-white p-5 text-sm text-ink-2">
          <h2 className="m-0 font-display text-base font-semibold text-ink">What we pull out</h2>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
            <li>Term end date and auto-renewal</li>
            <li>Notice period, and from it your notice deadline</li>
            <li>Renewal price uplift cap</li>
            <li>Seat reduction allowance</li>
            <li>Annual fee and seat count</li>
          </ul>
          <p className="m-0 text-[13px] text-muted">
            Each field shows the exact quote and page, with a confidence level. Low-confidence fields are flagged for review
            before they count toward your savings.
          </p>
        </aside>
      </div>
    </>
  );
}
