import Link from "next/link";
import { Logo } from "@/components/icons";
import { btnPrimary, cx } from "@/components/ui";
import { getSession } from "@/lib/server/workspace";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Where the main call to action goes, depending on whether the visitor is signed in. */
export async function getStartCta() {
  const signedIn = Boolean(await getSession());
  // Without Supabase the app runs as an open demo, so every CTA goes straight in.
  const href = signedIn || !isSupabaseConfigured ? "/" : "/login?mode=signup";
  const label = signedIn ? "Open your dashboard" : isSupabaseConfigured ? "Start free audit" : "Try the demo";
  return { signedIn, href, label };
}

/** Top bar for the public pages (home, pricing, solutions). */
export async function MarketingHeader() {
  const { signedIn, href, label } = await getStartCta();
  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-white" aria-label="Outflow home">
          <Logo />
          <span className="font-brand text-lg font-semibold">Outflow</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-5">
          <Link href="/#how" className="hidden text-sm text-navy-text hover:text-white lg:inline">How it works</Link>
          <Link href="/solutions" className="hidden text-sm text-navy-text hover:text-white md:inline">Solutions</Link>
          <Link href="/pricing" className="hidden text-sm text-navy-text hover:text-white md:inline">Pricing</Link>
          <Link href="/#faq" className="hidden text-sm text-navy-text hover:text-white lg:inline">FAQ</Link>
          {!signedIn && isSupabaseConfigured && (
            <Link href="/login" className="inline-flex min-h-10 items-center rounded-[10px] px-3 text-sm font-semibold text-white hover:bg-navy-hover">
              Log in
            </Link>
          )}
          <Link href={href} className={cx(btnPrimary, "min-h-10 px-3.5 sm:px-4")}>
            <span className="sm:hidden">{signedIn ? "Dashboard" : "Start free"}</span>
            <span className="hidden sm:inline">{label}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function FaqList({ items, headingLevel = 3 }: { items: { q: string; a: string }[]; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
      {items.map((f) => (
        <details key={f.q} className="group px-5 py-4 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <H className="m-0 text-[16px] font-semibold text-ink">{f.q}</H>
            <span aria-hidden className="shrink-0 text-xl leading-none text-muted transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="m-0 mt-3 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
