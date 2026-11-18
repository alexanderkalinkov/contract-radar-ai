import Link from "next/link";
import { Logo } from "@/components/icons";
import { ReportOnMount } from "@/components/help/ReportOnMount";
import { btnPrimary } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
      <ReportOnMount kind="not_found" status={404} message="Page not found" />
      <Logo size={40} tone="light" />
      <h1 className="m-0 font-display text-[28px] font-semibold">This page doesn&apos;t exist</h1>
      <p className="m-0 max-w-md text-muted">The link may be old or mistyped. We&apos;ve logged it so we can fix any broken links.</p>
      <Link href="/" className={btnPrimary}>Go to Outflow</Link>
    </main>
  );
}
