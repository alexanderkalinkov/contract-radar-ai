import type { Metadata, Viewport } from "next";
import { Inter, Sora, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Activity } from "@/components/Activity";
import { AuthHashForwarder } from "@/components/AuthHashForwarder";
import { ErrorTrail } from "@/components/help/ErrorTrail";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { getBilling } from "@/lib/server/billing";
import { getSession } from "@/lib/server/workspace";
import { helpVideoUrl } from "@/lib/server/help";
import { isPlatformAdmin } from "@/lib/server/platform";
import { SITE } from "@/lib/site";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["600"] });
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Defaults for every page. Public pages set their own title, description and canonical URL;
// signed-in pages are kept out of search results by their own layouts (robots: noindex).
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: SaaS renewal and price-hike tracking`, template: `%s · ${SITE.name}` },
  description: SITE.shortDescription,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.publisher.name, url: SITE.publisher.url }],
  creator: SITE.publisher.name,
  publisher: SITE.publisher.name,
  category: "business software",
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_US",
    url: "/",
    title: `${SITE.name}: SaaS renewal and price-hike tracking`,
    description: SITE.shortDescription,
  },
  twitter: { card: "summary_large_image", title: `${SITE.name}: SaaS renewal and price-hike tracking`, description: SITE.shortDescription },
  formatDetection: { telephone: false, email: false, address: false },
  verification: {
    // Set in Vercel once Google Search Console / Bing Webmaster Tools give you a code (or verify by DNS instead).
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = { themeColor: "#0b1b33" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const billing = session ? await getBilling(session.workspace.id) : null;
  const platformAdmin = session ? await isPlatformAdmin() : false;
  const cloud = session
    ? {
        userId: session.userId,
        name: session.name,
        tourSeen: session.tourSeen,
        viaSso: Boolean(session.viaSso),
        email: session.email,
        role: session.role,
        workspaceId: session.workspace.id,
        workspaceName: session.workspace.name,
        showSample: session.workspace.show_sample_data,
        onboarded: Boolean(session.workspace.onboarded_at),
        isDemo: Boolean(session.workspace.is_demo),
        workspaces: session.workspaces,
        billing: billing ?? undefined,
        platformAdmin,
      }
    : null;
  return (
    <html lang="en">
      <body className={`${inter.variable} ${sora.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <AuthHashForwarder />
        <Activity />
        <ErrorTrail />
        <WorkspaceProvider cloud={cloud} helpVideoUrl={helpVideoUrl()}>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
