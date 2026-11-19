import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The only outside origin the browser talks to: Supabase (auth, direct uploads to storage, the help video).
const supabase = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();
const supabaseWs = supabase.replace(/^https:/, "wss:");

// Content Security Policy. Next.js inlines small scripts and styles, so those need 'unsafe-inline';
// everything else (scripts from other sites, plugins, being framed by another site) is blocked.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`.trim(),
  "font-src 'self' data:",
  `media-src 'self' blob: ${supabase}`.trim(),
  `connect-src 'self' ${supabase} ${supabaseWs}${isDev ? " ws://localhost:* http://localhost:*" : ""}`.replace(/\s+/g, " ").trim(),
  `frame-src 'self' blob: ${supabase}`.trim(),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Put <title>, description and Open Graph tags in the initial <head> for every visitor, not streamed later:
  // many crawlers and link previewers (AI assistants, Slack, LinkedIn) don't run JavaScript.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Signed-in pages and API answers hold workspace data: never let a shared cache keep them.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  // Short, well-known addresses for the legal pages (Google, Microsoft and Stripe ask for these URLs).
  async redirects() {
    return [
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/dpa", destination: "/legal/dpa", permanent: true },
      { source: "/subprocessors", destination: "/legal/subprocessors", permanent: true },
    ];
  },
};

export default nextConfig;
