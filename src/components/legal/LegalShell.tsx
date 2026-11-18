import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/icons";
import { LEGAL, LEGAL_PAGES, type Subprocessor } from "@/lib/legal";
import { SiteFooter } from "@/components/legal/SiteFooter";

/** Public page frame for the privacy policy, terms, DPA and subprocessor list. */
export function LegalShell({ title, intro, current, children }: { title: string; intro: string; current: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-white">
            <Logo />
            <span className="font-brand text-lg font-semibold">Outflow</span>
          </Link>
          <Link href="/login" className="inline-flex min-h-10 items-center rounded-[10px] px-3 text-sm font-semibold text-white hover:bg-navy-hover">
            Log in
          </Link>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Legal" className="flex flex-row flex-wrap gap-2 lg:flex-col lg:gap-1">
          {LEGAL_PAGES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              aria-current={p.href === current ? "page" : undefined}
              className={
                p.href === current
                  ? "rounded-lg bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-dark"
                  : "rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-chip"
              }
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <article className="legal flex min-w-0 max-w-[760px] flex-col gap-4 text-[15px] leading-relaxed text-ink-2">
          {LEGAL.isDraft && (
            <p role="note" className="m-0 rounded-lg border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn-text">
              <strong>Draft for legal review.</strong> This page is a working draft and has not yet been reviewed by a lawyer. It may change
              before it takes effect. Text in [square brackets] is still to be filled in.
            </p>
          )}
          <h1 className="m-0 font-display text-[32px] leading-tight font-bold text-ink">{title}</h1>
          <p className="m-0 text-sm text-muted">Last updated: {LEGAL.lastUpdated}</p>
          <p className="m-0">{intro}</p>
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function H({ id, children }: { id?: string; children: ReactNode }) {
  return <h2 id={id} className="m-0 mt-6 font-display text-xl font-semibold text-ink">{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="m-0">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  return external ? (
    <a href={href} className="text-brand underline underline-offset-2" {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
    </a>
  ) : (
    <Link href={href} className="text-brand underline underline-offset-2">{children}</Link>
  );
}

/** Contact email from LEGAL_EMAIL as a mailto link, or the placeholder as plain text. */
export function ContactEmail() {
  return LEGAL.email.startsWith("[") ? <span>{LEGAL.email}</span> : <A href={`mailto:${LEGAL.email}`}>{LEGAL.email}</A>;
}

export function ProcessorTable({ rows, caption }: { rows: Subprocessor[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-canvas text-xs font-semibold tracking-wide text-muted uppercase">
          <tr>
            <th scope="col" className="px-3 py-2.5">Provider</th>
            <th scope="col" className="px-3 py-2.5">What for</th>
            <th scope="col" className="px-3 py-2.5">Data</th>
            <th scope="col" className="px-3 py-2.5">Location</th>
            <th scope="col" className="px-3 py-2.5">Transfer safeguard</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-line align-top">
              <th scope="row" className="px-3 py-2.5 font-semibold text-ink">
                <A href={r.url}>{r.name}</A>
              </th>
              <td className="px-3 py-2.5">{r.purpose}</td>
              <td className="px-3 py-2.5">{r.data}</td>
              <td className="px-3 py-2.5">{r.location}</td>
              <td className="px-3 py-2.5">{r.safeguard}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
