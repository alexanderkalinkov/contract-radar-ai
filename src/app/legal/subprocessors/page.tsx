import type { Metadata } from "next";
import { pageMeta } from "@/lib/page-meta";
import { A, ContactEmail, H, LegalShell, P, ProcessorTable } from "@/components/legal/LegalShell";
import { INTEGRATIONS, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = pageMeta({ path: "/legal/subprocessors", title: "Subprocessors", description: "The service providers that process customer data for Outflow, what for and where." });

export default function SubprocessorsPage() {
  return (
    <LegalShell
      current="/legal/subprocessors"
      title="Subprocessors"
      intro="These are the service providers that may process Customer Data on our behalf to run Outflow. Each one is bound by a written data processing agreement with protections at least as strong as those in our DPA."
    >
      <H id="core">Core subprocessors</H>
      <P>These are used for every workspace.</P>
      <ProcessorTable rows={SUBPROCESSORS} caption="Core subprocessors" />

      <H id="integrations">Integrations you choose to connect</H>
      <P>
        These services hold your own data under your own agreement with them. We only read from them when a workspace admin connects
        them, and only with read-only access, to find the software your company uses. Disconnecting deletes our stored access tokens.
      </P>
      <ProcessorTable rows={INTEGRATIONS} caption="Optional integrations" />

      <H id="changes">Changes to this list</H>
      <P>
        We will update this page and email workspace owners at least 30 days before a new subprocessor starts processing Customer Data. You
        can object in that time by writing to <ContactEmail />, as set out in the <A href="/legal/dpa">Data processing agreement</A>.
      </P>
    </LegalShell>
  );
}
