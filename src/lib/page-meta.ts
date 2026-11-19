import type { Metadata } from "next";
import { SITE } from "@/lib/site";

const IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: `${SITE.name}: SaaS renewal and price-hike tracking` };

/**
 * Metadata for a public page: title, description, canonical URL and the full Open Graph / X card.
 * Next.js replaces (not merges) openGraph and twitter objects per page, so every page sets them all here.
 */
export function pageMeta({ path, title, description, absoluteTitle = false, type = "website" }: {
  path: string;
  title: string;
  description: string;
  /** true: use the title as is; false: the layout adds " · Outflow". */
  absoluteTitle?: boolean;
  type?: "website" | "article";
}): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} · ${SITE.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type, siteName: SITE.name, locale: "en_US", url: path, title: fullTitle, description, images: [IMAGE] },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [IMAGE.url] },
  };
}
