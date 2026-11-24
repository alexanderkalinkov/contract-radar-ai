import type { Metadata } from "next";
import Link from "next/link";
import { IconCal, IconCheck, IconClock, IconDoc, IconMail, IconPlug, IconSpark, IconTrend, IconUsers } from "@/components/icons";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { FaqList, MarketingHeader, getStartCta } from "@/components/marketing/MarketingHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import { btnPrimary, cx } from "@/components/ui";
import { ALL_PLANS } from "@/lib/billing/plans";
import { FEE_RATE } from "@/lib/billing/savings";
import { getPublicPrices } from "@/lib/server/public-prices";
import { pageMeta } from "@/lib/page-meta";
import { HOME_FAQ, SITE, SOLUTIONS } from "@/lib/site";
import { faqPage, graph, organization, softwareApplication, webPage, website } from "@/lib/structured-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const TITLE = "Outflow: SaaS renewal and price-hike tracking for finance teams";
const DESCRIPTION =
  "Outflow finds every SaaS tool your company pays for, reads the contracts with AI, and warns you before auto-renewals and price hikes lock in. Know what to keep, cut seats, consolidate or renegotiate.";

// Signed-out visitors see this page at / (the middleware rewrites to /home), so / is the canonical address.
export const metadata: Metadata = pageMeta({ path: "/", title: TITLE, description: DESCRIPTION, absoluteTitle: true });

// Public marketing page. Signed-out visitors to / are rewritten here by the middleware.
export default async function LandingPage() {
  const [{ signedIn, href: startHref, label: startLabel }, prices] = await Promise.all([getStartCta(), getPublicPrices()]);
  const offers = ALL_PLANS.map((p) => {
    const m = prices.find((x) => x.plan === p.id && x.interval === "month");
    return { name: `${SITE.name} ${p.name}, monthly`, price: m?.amount ?? p.fallback.month, currency: m?.currency ?? "EUR" };
  });

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JsonLd data={graph(organization, website, softwareApplication(offers), webPage("/", TITLE, DESCRIPTION), faqPage(HOME_FAQ, "/"))} />
      <MarketingHeader />
      <main className="flex flex-col">
        <Hero startHref={startHref} startLabel={startLabel} />
        <IndustryNumbers />
        <ValueProps />
        <HowItWorks />
        <DashboardPreview />
        <Extras />
        <UseCases />
        <Faq />
        <FinalCta startHref={startHref} startLabel={startLabel} signedIn={signedIn} />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero({ startHref, startLabel }: { startHref: string; startLabel: string }) {
  return (
    <section className="bg-navy pb-16 text-white sm:pb-20">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col gap-6">
          <span className="w-fit rounded-full border border-navy-active bg-navy-2 px-3 py-1 text-[13px] font-semibold text-navy-muted">
            For CFOs, COOs and finance teams at 50–1,000 people
          </span>
          <h1 className="m-0 font-display text-[38px] leading-[1.08] font-bold tracking-tight sm:text-[52px]">
            Stop paying for SaaS <span className="text-[#FFB27A]">nobody</span> asked you to renew.
          </h1>
          <p className="m-0 max-w-[560px] text-[17px] leading-relaxed text-navy-text">
            Outflow finds every tool your company pays for, reads the contracts, and warns you before auto-renewals and price
            hikes lock in. Each renewal comes with a clear call: keep, cut seats, consolidate or renegotiate.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={startHref} className={cx(btnPrimary, "min-h-12 px-5 text-[15px]")}>{startLabel}</Link>
            <a href="#how" className="inline-flex min-h-12 items-center rounded-[10px] border border-navy-active px-5 text-[15px] font-semibold text-white hover:bg-navy-hover">
              See how it works
            </a>
          </div>
          <p className="m-0 text-[13px] text-navy-muted">
            Free audit of your first 3 contracts. No credit card. Then pay {Math.round(FEE_RATE * 100)}% of what we save you:{" "}
            <Link href="/pricing" className="underline underline-offset-2 hover:text-white">no savings, no fee</Link>.
          </p>
        </div>
        <HeroCard />
      </div>
    </section>
  );
}

function HeroCard() {
  const rows = [
    { name: "Salesforce", note: "Notice due in 12 days · 9% uplift proposed, contract caps at 5%", tag: "Renegotiate", tone: "warn" },
    { name: "Asana + Monday + ClickUp", note: "3 teams, 3 project tools · Asana is most used", tag: "Consolidate", tone: "brand" },
    { name: "Zoom", note: "140 seats paid · 61 active in the last 90 days", tag: "Cut seats", tone: "good" },
  ] as const;
  const tone = {
    warn: "bg-warn-soft text-warn-text",
    brand: "bg-brand-soft text-brand-dark",
    good: "bg-good-soft text-good-dark",
  };
  return (
    <div aria-label="Example of what Outflow finds" className="rounded-2xl bg-white p-5 text-ink shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[13px] font-semibold text-muted">Before your next renewals</p>
          <p className="m-0 font-display text-[24px] leading-tight font-bold">What Outflow flags</p>
        </div>
        <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-semibold text-ink-2">Example</span>
      </div>
      <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-canvas px-3.5 py-3">
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold">{r.name}</p>
              <p className="m-0 text-[13px] text-muted">{r.note}</p>
            </div>
            <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", tone[r.tone])}>{r.tag}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Industry figures with their sources. Only published research goes here, never our own customer claims.
// Re-check each figure when its source publishes a new edition (Zylo every January, Vertice monthly).
const STATS = [
  {
    figure: "36%",
    label: "of SaaS licenses go unused on average",
    source: "Zylo, 2026 SaaS Management Index",
    url: "https://zylo.com/news/2026-saas-management-index",
  },
  {
    figure: "12.7%",
    label: "SaaS price inflation year over year in August 2026, after a 16.4% peak in June",
    source: "Vertice, SaaS Inflation Index",
    url: "https://www.vertice.one/insights/saas-inflation-rate",
  },
  {
    figure: "81%",
    label: "of SaaS spend is controlled by business teams, with IT managing just 15%",
    source: "Zylo, 2026 SaaS Management Index",
    url: "https://zylo.com/news/2026-saas-management-index",
  },
  {
    figure: "152",
    label: "apps in use at the average company with up to 500 employees",
    source: "Zylo, 2025 SaaS Management Index",
    url: "https://zylo.com/news/2025-saas-management-index",
  },
];

function IndustryNumbers() {
  return (
    <section aria-labelledby="numbers-title" className="border-b border-line bg-white py-14 sm:py-16">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-[640px] flex-col gap-2">
            <p className="m-0 text-[13px] font-semibold tracking-wide text-brand uppercase">Why it matters</p>
            <h2 id="numbers-title" className="m-0 font-display text-[26px] leading-tight font-bold sm:text-[30px]">
              Software prices rise faster than budgets, and a third of seats sit idle
            </h2>
          </div>
          <p className="m-0 text-[13px] text-muted">Independent industry research. Sources linked below each figure.</p>
        </div>
        <ul className="m-0 mt-8 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <li key={s.figure} className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas p-5">
              <span className="font-display text-[36px] leading-none font-bold text-navy">{s.figure}</span>
              <span className="text-[15px] leading-snug text-ink-2">{s.label}</span>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-auto pt-2 text-[12px] font-medium text-muted underline decoration-line underline-offset-2 hover:text-brand">
                {s.source}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ValueProps() {
  const items = [
    {
      icon: <IconClock size={22} />,
      title: "Catch auto-renewals in time",
      body: "Claude reads each contract for the notice period, renewal date and uplift cap, then alerts the owner well before the window closes.",
    },
    {
      icon: <IconTrend size={22} />,
      title: "Push back on price hikes",
      body: "When a vendor raises prices above the cap in your contract, you see it next to the clause that says they can't.",
    },
    {
      icon: <IconUsers size={22} />,
      title: "Cut unused seats",
      body: "Login data from Google Workspace or Microsoft shows who actually uses each tool, so you renew for the team you have.",
    },
    {
      icon: <IconPlug size={22} />,
      title: "Consolidate overlapping tools",
      body: "Spot three teams paying for three project tools, and see which one people rely on most.",
    },
    {
      icon: <IconMail size={22} />,
      title: "Claude drafts the pushback email",
      body: "One click gives you a ready-to-send email to the vendor that quotes the exact clause and page number.",
    },
    {
      icon: <IconCal size={22} />,
      title: "One renewal calendar",
      body: "Every renewal, owner and deadline in one place, with a recommendation for each tool.",
    },
  ];
  return (
    <section id="features" className="scroll-mt-4 bg-canvas py-16 sm:py-20">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
        <SectionHead eyebrow="What it catches" title="The money leaks finance never sees until the invoice arrives" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.title} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">{it.icon}</span>
              <h3 className="m-0 font-display text-lg font-semibold">{it.title}</h3>
              <p className="m-0 text-[15px] leading-relaxed text-muted">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      who: "CFO, COO or CEO · about 10 minutes",
      title: "Connect your systems",
      body: "Create the workspace, set the budget owner, and connect accounting (QuickBooks or Xero) and Google Workspace or Microsoft SSO.",
      result: "Within minutes you have a draft list of every tool the company pays for, with spend and active users.",
    },
    {
      who: "Admin",
      title: "Invite department owners",
      body: "Invite one head per department: Sales, Marketing, Engineering and so on. Outflow pre-assigns tools to departments based on who uses them.",
      result: "Each owner sees: “Here are the 14 tools we think your team uses. Confirm them.”",
    },
    {
      who: "Department owners · a few minutes per tool",
      title: "Fill the gaps",
      body: "Upload the contract or forward it to your company's Outflow address, and Claude extracts the terms. Then answer 4 quick questions per tool.",
      result: "What you use it for, how critical it is (1–5), what you'd use instead, and whether all the seats are needed.",
    },
    {
      who: "C-level",
      title: "Decide with one dashboard",
      body: "See overlaps, low-value tools (high cost, low criticality, few logins) and a renewal calendar.",
      result: "Every tool gets a recommendation: keep, cut seats, consolidate or renegotiate.",
    },
  ];
  return (
    <section id="how" className="scroll-mt-4 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
        <SectionHead
          eyebrow="How it works"
          title="Pulled in automatically, confirmed by the people who use it"
          sub="No one types in a tool list. Outflow builds it from your books and your logins, then asks each team only to confirm and explain."
        />
        <ol className="m-0 mt-10 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy font-display text-sm font-bold text-white">{i + 1}</span>
              <p className="m-0 text-xs font-semibold tracking-wide text-muted uppercase">{s.who}</p>
              <h3 className="m-0 font-display text-lg font-semibold">{s.title}</h3>
              <p className="m-0 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
              <p className="m-0 mt-auto rounded-xl bg-brand-soft px-3.5 py-3 text-sm leading-relaxed text-brand-dark">{s.result}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function DashboardPreview() {
  const recs = [
    { tool: "Salesforce", dept: "Sales", renews: "Dec 1", rec: "Renegotiate", why: "9% hike vs 5% cap in §7.2" },
    { tool: "Monday.com", dept: "Marketing", renews: "Jan 14", rec: "Consolidate", why: "Overlaps with Asana, criticality 2/5" },
    { tool: "Zoom", dept: "All", renews: "Feb 3", rec: "Cut seats", why: "79 of 140 seats unused" },
    { tool: "Figma", dept: "Product", renews: "Mar 20", rec: "Keep", why: "Criticality 5/5, 96% active" },
  ];
  const recTone: Record<string, string> = {
    Renegotiate: "bg-warn-soft text-warn-text",
    Consolidate: "bg-brand-soft text-brand-dark",
    "Cut seats": "bg-good-soft text-good-dark",
    Keep: "bg-chip text-ink-2",
  };
  return (
    <section className="bg-canvas py-16 sm:py-20">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-4">
          <SectionHead eyebrow="For the C-level" title="A renewal calendar that tells you what to do" align="left" />
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {[
              "Overlaps across teams, with the most-used tool named",
              "Low-value tools: high cost, low criticality, few logins",
              "Every renewal with its notice deadline and owner",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[15px] text-ink-2">
                <IconCheck size={18} className="mt-0.5 shrink-0 text-good" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
            <p className="m-0 font-display font-semibold">Upcoming renewals</p>
            <span className="text-xs font-semibold text-muted">Example</span>
          </div>
          <ul className="m-0 list-none p-0">
            {recs.map((r) => (
              <li key={r.tool} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line-soft px-5 py-3.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">
                    {r.tool} <span className="font-normal text-muted">· {r.dept} · renews {r.renews}</span>
                  </p>
                  <p className="m-0 text-[13px] text-muted">{r.why}</p>
                </div>
                <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", recTone[r.rec])}>{r.rec}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Extras() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-[1180px] gap-4 px-4 sm:px-8 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl bg-navy p-7 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-2 text-[#FFB27A]"><IconSpark size={20} /></span>
          <h3 className="m-0 font-display text-xl font-semibold">Savings on day one</h3>
          <p className="m-0 text-[15px] leading-relaxed text-navy-text">
            Outflow shows the first savings from your accounting and login data before any department owner lifts a finger.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-7">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><IconDoc size={20} /></span>
          <h3 className="m-0 font-display text-xl font-semibold">Answers that stay current</h3>
          <p className="m-0 text-[15px] leading-relaxed text-muted">
            A month before each renewal, the owner gets the 4-question survey again, so the decision rests on how the team uses the tool today.
          </p>
        </div>
      </div>
    </section>
  );
}

function FinalCta({ startHref, startLabel, signedIn }: { startHref: string; startLabel: string; signedIn: boolean }) {
  return (
    <section className="bg-navy py-16 text-white sm:py-20">
      <div className="mx-auto flex max-w-[760px] flex-col items-center gap-5 px-4 text-center sm:px-8">
        <h2 className="m-0 font-display text-[30px] leading-tight font-bold sm:text-[38px]">Find out what your next renewal really costs.</h2>
        <p className="m-0 text-[17px] text-navy-text">
          Upload 3 contracts and get a free audit of notice deadlines, price caps and seat waste. After that, pay a share of what you save, or a flat plan.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={startHref} className={cx(btnPrimary, "min-h-12 px-5 text-[15px]")}>{startLabel}</Link>
          {!signedIn && isSupabaseConfigured && (
            <Link href="/login" className="inline-flex min-h-12 items-center rounded-[10px] border border-navy-active px-5 text-[15px] font-semibold text-white hover:bg-navy-hover">
              Log in
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  return (
    <section aria-labelledby="usecases-title" className="bg-canvas py-16 sm:py-20">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-[640px] flex-col gap-2">
            <p className="m-0 text-[13px] font-semibold tracking-wide text-brand uppercase">Use cases</p>
            <h2 id="usecases-title" className="m-0 font-display text-[28px] leading-tight font-bold sm:text-[34px]">One place for every SaaS contract decision</h2>
          </div>
          <Link href="/solutions" className="text-sm font-semibold text-brand hover:underline">All solutions →</Link>
        </div>
        <ul className="m-0 mt-8 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {SOLUTIONS.map((s) => (
            <li key={s.slug}>
              <Link href={`/solutions/${s.slug}`} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-white p-5 hover:border-brand">
                <h3 className="m-0 font-display text-[17px] font-semibold text-ink">{s.title}</h3>
                <p className="m-0 text-[14px] leading-relaxed text-muted">{s.h1}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-4 bg-white py-16 sm:py-20">
      <div className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 sm:px-8">
        <div className="flex flex-col gap-3 text-center">
          <p className="m-0 text-[13px] font-semibold tracking-wide text-brand uppercase">FAQ</p>
          <h2 id="faq-title" className="m-0 font-display text-[28px] leading-tight font-bold sm:text-[34px]">Questions finance teams ask</h2>
        </div>
        <FaqList items={HOME_FAQ} />
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, sub, align = "center" }: { eyebrow: string; title: string; sub?: string; align?: "center" | "left" }) {
  return (
    <div className={cx("flex flex-col gap-3", align === "center" && "mx-auto max-w-[720px] text-center")}>
      <p className="m-0 text-[13px] font-semibold tracking-wide text-brand uppercase">{eyebrow}</p>
      <h2 className="m-0 font-display text-[28px] leading-tight font-bold sm:text-[34px]">{title}</h2>
      {sub && <p className="m-0 text-[16px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}
