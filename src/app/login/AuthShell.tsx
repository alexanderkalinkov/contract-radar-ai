import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/icons";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-navy px-4 py-10">
      <Link href="/" className="flex items-center gap-2.5 text-white">
        <Logo size={32} />
        <span className="font-brand text-xl font-semibold">Outflow</span>
      </Link>
      <div className="cr-card-in flex w-full max-w-[400px] flex-col gap-5 rounded-2xl bg-white p-7">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-display text-2xl font-semibold">{title}</h1>
          <p className="m-0 text-sm text-muted">{subtitle}</p>
        </div>
        {children}
      </div>
      <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-navy-muted">
        <Link href="/legal/privacy" className="hover:text-white hover:underline">Privacy</Link>
        <Link href="/legal/terms" className="hover:text-white hover:underline">Terms</Link>
        <Link href="/legal/dpa" className="hover:text-white hover:underline">DPA</Link>
        <Link href="/legal/subprocessors" className="hover:text-white hover:underline">Subprocessors</Link>
      </nav>
    </div>
  );
}

export function FormAlert({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {error && <p role="alert" className="m-0 rounded-lg bg-[#FEF3F2] px-3 py-2 text-sm text-[#912018]">{error}</p>}
      {message && <p role="status" className="m-0 rounded-lg bg-good-soft px-3 py-2 text-sm text-good-dark">{message}</p>}
    </>
  );
}
