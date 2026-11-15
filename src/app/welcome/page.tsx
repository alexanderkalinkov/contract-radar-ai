import Link from "next/link";
import { ConnectSources } from "@/components/ConnectSources";
import { Logo } from "@/components/icons";

// First-login onboarding (spec §5.1): no sidebar, just the setup steps.
export default function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-navy px-4 py-4 text-white sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <Logo />
          <span className="font-display text-lg font-bold">Contract Radar</span>
        </Link>
        <span className="text-[13px] text-navy-text">Free contract audit</span>
      </header>
      <main className="mx-auto w-full max-w-[1180px] px-4 pt-9 pb-14 sm:px-8">
        <ConnectSources onboarding />
      </main>
    </div>
  );
}
