import type { Metadata } from "next";

// Sign-in pages: crawlable (so search engines see this tag) but kept out of search results.
export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Outflow workspace.",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
