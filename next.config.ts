import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
