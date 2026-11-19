import { SITE, absoluteUrl, type Faq } from "@/lib/site";

// schema.org objects shared by the public pages. Ids let the graph pieces point at each other.
const ORG_ID = `${SITE.publisher.url}/#organization`;
const APP_ID = `${SITE.url}/#software`;
const SITE_ID = `${SITE.url}/#website`;

export const organization = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE.publisher.name,
  url: SITE.publisher.url,
  logo: absoluteUrl("/brand/outflow-logo-light.png"),
  brand: { "@type": "Brand", name: SITE.name },
};

export const website = {
  "@type": "WebSite",
  "@id": SITE_ID,
  name: SITE.name,
  url: SITE.url,
  description: SITE.shortDescription,
  publisher: { "@id": ORG_ID },
  inLanguage: "en",
};

export function softwareApplication(offers?: { name: string; price: number; currency: string }[]) {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "SaaS spend management",
    operatingSystem: "Web browser",
    audience: { "@type": "BusinessAudience", audienceType: SITE.audience },
    publisher: { "@id": ORG_ID },
    image: absoluteUrl("/opengraph-image.png"),
    featureList: [
      "AI extraction of renewal dates, notice periods, auto-renewal and price-increase caps from SaaS contracts, with source quotes",
      "Renewal reminders 90, 60 and 30 days before the notice deadline",
      "Renewal calendar with calendar file export",
      "SaaS price-increase tracking against contract caps",
      "AI-drafted vendor pushback emails",
      "SaaS discovery from QuickBooks, Xero, Google Workspace and Microsoft",
      "Unused license and overlapping tool detection",
      "Renewal approval workflow and audit log",
      "Two-step sign-in with an authenticator app",
    ],
    offers: [
      { "@type": "Offer", name: "Free audit of 3 contracts and 14-day trial", price: 0, priceCurrency: "EUR", url: absoluteUrl("/pricing") },
      ...(offers ?? []).map((o) => ({
        "@type": "Offer",
        name: o.name,
        price: o.price,
        priceCurrency: o.currency,
        url: absoluteUrl("/pricing"),
        priceSpecification: { "@type": "UnitPriceSpecification", price: o.price, priceCurrency: o.currency, billingDuration: "P1M", unitText: "month" },
      })),
    ],
  };
}

export function faqPage(faq: Faq[], path: string) {
  return {
    "@type": "FAQPage",
    "@id": `${absoluteUrl(path)}#faq`,
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

export function webPage(path: string, name: string, description: string) {
  return {
    "@type": "WebPage",
    "@id": absoluteUrl(path),
    url: absoluteUrl(path),
    name,
    description,
    isPartOf: { "@id": SITE_ID },
    about: { "@id": APP_ID },
    inLanguage: "en",
  };
}

export const graph = (...nodes: Record<string, unknown>[]) => ({ "@context": "https://schema.org", "@graph": nodes });
