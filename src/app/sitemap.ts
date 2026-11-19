import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, absoluteUrl } from "@/lib/site";

// Every public page. Add new marketing pages to PUBLIC_PAGES in src/lib/site.ts.
const UPDATED = new Date("2026-11-19");

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({
    url: absoluteUrl(p.path),
    lastModified: UPDATED,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
