import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMeta } from "@/lib/page-meta";
import { SOLUTIONS, absoluteUrl } from "@/lib/site";
import { breadcrumbs, graph, organization, webPage, website } from "@/lib/structured-data";

const TITLE = "Solutions for SaaS renewals, price hikes and unused licenses";
const DESCRIPTION =
  "How finance teams use Outflow: track SaaS renewals and notice deadlines, push back on price increases, cut unused licenses and extract contract terms with AI.";

export const metadata: Metadata = pageMeta({ path: "/solutions", title: TITLE, description: DESCRIPTION });

export default function SolutionsIndex() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JsonLd
        data={graph(
          organization,
          website,
          webPage("/solutions", TITLE, DESCRIPTION),
          {
            "@type": "ItemList",
            itemListElement: SOLUTIONS.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.title, url: absoluteUrl(`/solutions/${s.slug}`) })),
          },
          breadcrumbs([{ name: "Home", path: "/" }, { name: "Solutions", path: "/solutions" }]),
        )}
      />
      <MarketingHeader />
      <main className="flex flex-col">
        <section className="bg-navy pt-10 pb-14 text-white sm:pt-14">
          <div className="mx-auto flex max-w-[820px] flex-col items-center gap-4 px-4 text-center sm:px-8">
            <h1 className="m-0 font-display text-[34px] leading-tight font-bold sm:text-[46px]">What finance teams use Outflow for</h1>
            <p className="m-0 max-w-[640px] text-[17px] leading-relaxed text-navy-text">{DESCRIPTION}</p>
          </div>
        </section>
        <section className="bg-canvas py-14 sm:py-16">
          <ul className="m-0 mx-auto grid max-w-[1180px] list-none gap-4 px-4 sm:px-8 md:grid-cols-2">
            {SOLUTIONS.map((s) => (
              <li key={s.slug}>
                <Link href={`/solutions/${s.slug}`} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-white p-6 hover:border-brand">
                  <h2 className="m-0 font-display text-xl font-semibold text-ink">{s.title}</h2>
                  <p className="m-0 text-[15px] leading-relaxed text-muted">{s.description}</p>
                  <span className="mt-auto pt-2 text-sm font-semibold text-brand">Read more →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
