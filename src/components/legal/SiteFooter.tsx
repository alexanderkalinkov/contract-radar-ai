import Link from "next/link";
import { Logo } from "@/components/icons";
import { LEGAL, LEGAL_PAGES } from "@/lib/legal";

/** Public footer for the landing and legal pages. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-6 text-[13px] text-muted sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="rounded-md bg-navy p-1"><Logo size={18} /></span>
            Outflow
          </span>
          <span>SaaS contract and price-hike tracking for finance teams.</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="text-ink-2 hover:text-ink hover:underline">
                {p.label}
              </Link>
            ))}
          </nav>
          <span>© {new Date().getFullYear()} {LEGAL.companyName.startsWith("[") ? "Outflow" : LEGAL.companyName}</span>
        </div>
      </div>
    </footer>
  );
}
