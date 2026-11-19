import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Signed-in areas and APIs: nothing there for search engines. /login stays crawlable so its noindex tag is seen.
const PRIVATE = ["/api/", "/admin", "/auth/", "/setup", "/welcome", "/samples/"];

// AI assistants and answer engines are welcome on the public pages: being quoted by them is the point.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "DuckAssistBot",
  "MistralAI-User",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
