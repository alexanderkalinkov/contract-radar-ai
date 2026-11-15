import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AuthHashForwarder } from "@/components/AuthHashForwarder";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { getSession } from "@/lib/server/workspace";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Contract Radar",
  description: "Find SaaS savings before your renewal deadlines pass.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const cloud = session
    ? {
        email: session.email,
        role: session.role,
        workspaceId: session.workspace.id,
        workspaceName: session.workspace.name,
        showSample: session.workspace.show_sample_data,
        onboarded: Boolean(session.workspace.onboarded_at),
      }
    : null;
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <AuthHashForwarder />
        <WorkspaceProvider cloud={cloud}>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
