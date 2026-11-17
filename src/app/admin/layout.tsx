import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminTabs, AdminToast } from "@/components/admin/AdminUi";
import { IconShield, Logo } from "@/components/icons";
import { getPlatformCtx } from "@/lib/server/platform";

export const metadata: Metadata = { title: "Platform admin · Contract Radar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The platform admin console: runs across every workspace, for the people who operate Contract Radar.
 * Anyone else gets a plain 404, and every page and action checks again on the server.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPlatformCtx();
  if (!ctx) notFound();
  const { count } = await ctx.db.from("support_requests").select("id", { head: true, count: "exact" }).eq("status", "open");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-navy text-white">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-2 px-4 pt-3 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/admin" className="flex items-center gap-2.5 text-white">
              <Logo />
              <span className="font-display text-lg font-bold tracking-tight">Contract Radar</span>
              <span className="flex items-center gap-1 rounded-full bg-[#FFB27A] px-2 py-0.5 text-[11px] font-bold text-navy">
                <IconShield size={12} /> Platform admin
              </span>
            </Link>
            <div className="flex items-center gap-3 text-xs text-navy-muted">
              <span className="hidden truncate sm:inline">{ctx.session.email}</span>
              <Link href="/" className="min-h-9 rounded-lg border border-navy-active px-3 text-[13px] leading-9 font-semibold text-white hover:bg-navy-hover">
                Back to the app
              </Link>
            </div>
          </div>
          <AdminTabs supportOpen={count ?? 0} />
        </div>
      </header>
      <main className="mx-auto flex w-full min-w-0 max-w-[1320px] flex-1 flex-col gap-6 px-4 pt-7 pb-12 sm:px-8">{children}</main>
      <AdminToast />
    </div>
  );
}
