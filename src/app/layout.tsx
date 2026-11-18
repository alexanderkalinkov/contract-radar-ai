import type { Metadata } from "next";
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

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["600"] });
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Outflow",
  description: "Find SaaS savings before your renewal deadlines pass.",
  applicationName: "Outflow",
};

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
