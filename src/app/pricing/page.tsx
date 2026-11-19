import type { Metadata } from "next";
import Link from "next/link";
import { IconCheck } from "@/components/icons";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { FaqList, MarketingHeader, getStartCta } from "@/components/marketing/MarketingHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import { btnPrimary, cx } from "@/components/ui";
import { PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { pageMeta } from "@/lib/page-meta";
import { getPublicPrices } from "@/lib/server/public-prices";
import { breadcrumbs, faqPage, graph, organization, softwareApplication, webPage, website } from "@/lib/structured-data";

const TITLE = "Pricing: plans for SaaS renewal and spend tracking";
const DESCRIPTION = `Outflow pricing. Start with a free audit of 3 contracts and a ${TRIAL_DAYS}-day free trial, then choose Starter, Growth or Business, billed monthly or yearly.`;

export const metadata: Metadata = pageMeta({ path: "/pricing", title: TITLE, description: DESCRIPTION });

const PRICING_FAQ = [
  { q: "Is there a free trial?", a: `Yes. Every new workspace gets a ${TRIAL_DAYS}-day free trial with Growth plan limits, and a free audit of your first 3 contracts. No credit card is needed to start.` },
  { q: "What counts as a contract?", a: "Each contract, order form or renewal quote that Outflow reads with AI counts as one contract. Tools found through accounting or sign-in data without a document don't count." },
  { q: "Can I switch plans or cancel?", a: "Yes. You can upgrade, downgrade or cancel from the billing page at any time. Yearly plans are billed up front at a lower price per month." },
  { q: "Do prices include VAT?", a: "Prices are shown excluding VAT. Companies can add their VAT number at checkout so it appears on the invoice." },
];

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}

export default async function PricingPage() {
  const [prices, cta] = await Promise.all([getPublicPrices(), getStartCta()]);
  const price = (plan: string, interval: "month" | "year") => prices.find((p) => p.plan === plan && p.interval === interval);
  const monthly = PLANS.map((p) => ({ name: `Outflow ${p.name}, monthly`, price: price(p.id, "month")?.amount ?? p.fallback.month, currency: price(p.id, "month")?.currency ?? "EUR" }));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JsonLd
        data={graph(
          organization,
          website,
          softwareApplication(monthly),
          webPage("/pricing", TITLE, DESCRIPTION),
          faqPage(PRICING_FAQ, "/pricing"),
          breadcrumbs([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]),
        )}
      />
      <MarketingHeader />
      <main className="flex flex-col">
        <section className="bg-navy pt-10 pb-14 text-white sm:pt-14">
          <div className="mx-auto flex max-w-[820px] flex-col items-center gap-4 px-4 text-center sm:px-8">
            <h1 className="m-0 font-display text-[34px] leading-tight font-bold sm:text-[46px]">Pricing that pays for itself at the first renewal</h1>
            <p className="m-0 max-w-[640px] text-[17px] leading-relaxed text-navy-text">
              Start with a free audit of 3 contracts and a {TRIAL_DAYS}-day free trial. No credit card. Pick a plan when you see the savings.
            </p>
          </div>
        </section>
        <section className="bg-canvas py-14 sm:py-16">
          <div className="mx-auto grid max-w-[1180px] gap-4 px-4 sm:px-8 md:grid-cols-3">
            {PLANS.map((p) => {
              const m = price(p.id, "month");
              const y = price(p.id, "year");
              const highlight = p.id === "growth";
              return (
                <div key={p.id} className={cx("flex flex-col gap-4 rounded-2xl border bg-white p-6", highlight ? "border-brand shadow-[0_12px_32px_rgba(29,78,216,0.12)]" : "border-line")}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="m-0 font-display text-xl font-semibold">{p.name}</h2>
                    {highlight && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-dark">Most popular</span>}
                  </div>
                  <p className="m-0 text-[15px] text-muted">{p.blurb}</p>
                  <div>
                    <p className="m-0">
                      <span className="font-display text-[36px] font-bold">{money(m?.amount ?? p.fallback.month, m?.currency ?? "EUR")}</span>
                      <span className="text-muted"> / month</span>
                    </p>
                    <p className="m-0 text-[13px] text-muted">or {money(y?.amount ?? p.fallback.year, y?.currency ?? "EUR")} billed yearly</p>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[15px] text-ink-2">
                        <IconCheck size={18} className="mt-0.5 shrink-0 text-good" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={cta.href} className={cx(btnPrimary, "mt-auto min-h-11 justify-center")}>{cta.signedIn ? "Open your dashboard" : "Start free trial"}</Link>
                </div>
              );
            })}
          </div>
          <p className="mx-auto mt-6 max-w-[1180px] px-4 text-center text-[13px] text-muted sm:px-8">Prices exclude VAT. Every plan includes AI contract reading, renewal reminders, the renewal calendar and AI-drafted pushback emails.</p>
        </section>
        <section className="bg-white py-14 sm:py-16">
          <div className="mx-auto flex max-w-[820px] flex-col gap-6 px-4 sm:px-8">
            <h2 className="m-0 text-center font-display text-[28px] font-bold">Pricing questions</h2>
            <FaqList items={PRICING_FAQ} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
