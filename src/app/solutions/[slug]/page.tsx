import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconCheck } from "@/components/icons";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { FaqList, MarketingHeader, getStartCta } from "@/components/marketing/MarketingHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import { btnPrimary, cx } from "@/components/ui";
import { pageMeta } from "@/lib/page-meta";
import { SOLUTIONS } from "@/lib/site";
import { breadcrumbs, faqPage, graph, organization, softwareApplication, webPage, website } from "@/lib/structured-data";

// One page per use case, written around the questions people (and AI assistants) ask. Content lives in src/lib/site.ts.
export const dynamicParams = false;
export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = SOLUTIONS.find((x) => x.slug === slug);
  if (!s) return {};
  const path = `/solutions/${s.slug}`;
  return pageMeta({ path, title: s.title, description: s.description, type: "article" });
}

export default async function SolutionPage({ params }: Props) {
  const { slug } = await params;
  const s = SOLUTIONS.find((x) => x.slug === slug);
  if (!s) notFound();
  const path = `/solutions/${s.slug}`;
  const cta = await getStartCta();
  const others = SOLUTIONS.filter((x) => x.slug !== s.slug);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JsonLd
        data={graph(
          organization,
          website,
          softwareApplication(),
          webPage(path, s.title, s.description),
          faqPage(s.faq, path),
          breadcrumbs([
            { name: "Home", path: "/" },
            { name: "Solutions", path: "/solutions" },
            { name: s.nav, path },
          ]),
        )}
      />
      <MarketingHeader />
      <main className="flex flex-col">
        <section className="bg-navy pt-8 pb-14 text-white sm:pt-12">
          <div className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 sm:px-8">
            <nav aria-label="Breadcrumb" className="text-[13px] text-navy-muted">
              <Link href="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span>{" "}
              <Link href="/solutions" className="hover:text-white">Solutions</Link> <span aria-hidden>/</span> <span className="text-navy-text">{s.nav}</span>
            </nav>
            <p className="m-0 text-[13px] font-semibold tracking-wide text-[#FFB27A] uppercase">{s.title}</p>
            <h1 className="m-0 font-display text-[34px] leading-[1.1] font-bold tracking-tight sm:text-[46px]">{s.h1}</h1>
            <p className="m-0 max-w-[680px] text-[17px] leading-relaxed text-navy-text">{s.intro}</p>
            <div className="flex flex-wrap gap-3">
              <Link href={cta.href} className={cx(btnPrimary, "min-h-12 px-5 text-[15px]")}>{cta.label}</Link>
              <Link href="/pricing" className="inline-flex min-h-12 items-center rounded-[10px] border border-navy-active px-5 text-[15px] font-semibold text-white hover:bg-navy-hover">
                See pricing
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-white py-14 sm:py-16">
          <div className="mx-auto flex max-w-[860px] flex-col gap-3 px-4 sm:px-8">
            <h2 className="m-0 font-display text-[26px] font-bold">{s.problem.title}</h2>
            <p className="m-0 text-[16px] leading-relaxed text-ink-2">{s.problem.body}</p>
          </div>
        </section>

        <section className="bg-canvas py-14 sm:py-16">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
            <h2 className="m-0 text-center font-display text-[26px] font-bold sm:text-[30px]">How Outflow does it</h2>
            <ol className="m-0 mt-8 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-4">
              {s.steps.map((st, i) => (
                <li key={st.title} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy font-display text-sm font-bold text-white">{i + 1}</span>
                  <h3 className="m-0 font-display text-lg font-semibold">{st.title}</h3>
                  <p className="m-0 text-[15px] leading-relaxed text-ink-2">{st.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-white py-14 sm:py-16">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-4 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col gap-4">
              <h2 className="m-0 font-display text-[26px] font-bold">What you get</h2>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {s.outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-2.5 text-[15px] text-ink-2">
                    <IconCheck size={18} className="mt-0.5 shrink-0 text-good" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-4">
              <h2 className="m-0 font-display text-[26px] font-bold">Questions</h2>
              <FaqList items={s.faq} />
            </div>
          </div>
        </section>

        <section className="bg-canvas py-14">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
            <h2 className="m-0 font-display text-xl font-semibold">More ways teams use Outflow</h2>
            <ul className="m-0 mt-5 grid list-none gap-4 p-0 md:grid-cols-3">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/solutions/${o.slug}`} className="flex h-full flex-col gap-1.5 rounded-2xl border border-line bg-white p-5 hover:border-brand">
                    <span className="font-semibold text-ink">{o.title}</span>
                    <span className="text-[14px] text-muted">{o.h1}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-navy py-14 text-white">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-5 px-4 text-center sm:px-8">
            <h2 className="m-0 font-display text-[28px] leading-tight font-bold sm:text-[34px]">Find out what your next renewal really costs.</h2>
            <p className="m-0 text-[17px] text-navy-text">Upload 3 contracts and get a free audit of notice deadlines, price caps and seat waste.</p>
            <Link href={cta.href} className={cx(btnPrimary, "min-h-12 px-5 text-[15px]")}>{cta.label}</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
