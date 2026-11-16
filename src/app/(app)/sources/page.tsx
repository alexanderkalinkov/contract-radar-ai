import Link from "next/link";
import { ConnectSources } from "@/components/ConnectSources";

export default function SourcesPage() {
  return (
    <>
      <Link
        href="/discover"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-brand-line bg-brand-soft px-5 py-4 text-ink hover:bg-[#E0E7FF]"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">Connect QuickBooks, Xero, Google Workspace or Microsoft for real</span>
          <span className="text-[13px] text-ink-2">Find every tool you pay for and who uses it, then send each one to its department owner.</span>
        </span>
        <span className="text-sm font-semibold text-brand">Discovered tools →</span>
      </Link>
      <ConnectSources />
    </>
  );
}
