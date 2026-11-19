import type { Metadata } from "next";
import { pageMeta } from "@/lib/page-meta";
import { A, ContactEmail, H, LegalShell, P, UL } from "@/components/legal/LegalShell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMeta({ path: "/legal/dpa", title: "Data processing agreement", description: "Outflow's GDPR Article 28 data processing agreement for business customers." });

export default function DpaPage() {
  return (
    <LegalShell
      current="/legal/dpa"
      title="Data processing agreement"
      intro={`This data processing agreement ("DPA") forms part of the Terms of service between ${LEGAL.companyName} ("Processor", "we") and the Customer ("Controller", "you"). It applies when we process personal data on your behalf in providing Outflow, and sets out the terms required by Article 28 of the EU General Data Protection Regulation (GDPR).`}
    >
      <H id="definitions">1. Definitions</H>
      <P>
        &quot;Customer Data&quot;, &quot;personal data&quot;, &quot;processing&quot;, &quot;controller&quot;, &quot;processor&quot;,
        &quot;data subject&quot; and &quot;personal data breach&quot; have the meanings given in the GDPR and our{" "}
        <A href="/legal/terms">Terms of service</A>. &quot;Subprocessor&quot; means a third party we engage to process Customer Data.
      </P>

      <H id="details">2. Details of the processing</H>
      <UL>
        <li><strong>Subject matter and purpose:</strong> providing the Service: storing and analysing software contracts, finding tools in connected systems, sending reminders, and support.</li>
        <li><strong>Duration:</strong> for as long as the Terms apply, plus the deletion period in section 10.</li>
        <li><strong>Categories of data subjects:</strong> Customer&apos;s employees and contractors (users and people found in connected directories), and contacts named in uploaded contracts (vendor signatories, account managers).</li>
        <li><strong>Types of personal data:</strong> names, work email addresses, job titles and departments, app sign-in events and timestamps, and names, emails, phone numbers and signatures that appear in uploaded contracts.</li>
        <li><strong>Special categories:</strong> none intended. You should not upload contracts containing special-category data (Article 9 GDPR).</li>
      </UL>

      <H id="instructions">3. Processing on instructions</H>
      <P>
        We process Customer Data only on your documented instructions. The Terms, this DPA and your use and configuration of the Service
        are your complete instructions. We will tell you if we think an instruction breaks data-protection law, and we will not process
        Customer Data for any other purpose unless EU or member-state law requires it, in which case we will tell you first unless the law
        forbids that.
      </P>

      <H id="confidentiality">4. Confidentiality</H>
      <P>Everyone we authorise to process Customer Data is bound by a duty of confidentiality.</P>

      <H id="security">5. Security</H>
      <P>We maintain appropriate technical and organisational measures under Article 32 GDPR, including:</P>
      <UL>
        <li>encryption in transit (TLS 1.2 or higher) and at rest;</li>
        <li>separation of each customer&apos;s workspace with database row-level security;</li>
        <li>OAuth tokens for connected systems encrypted with a separate key, and read-only access scopes;</li>
        <li>production access limited to authorised personnel, with multi-factor authentication;</li>
        <li>hosting of the primary database in the EU (Frankfurt, Germany), with daily backups;</li>
        <li>dependency updates and review of security advisories.</li>
      </UL>

      <H id="subprocessors">6. Subprocessors</H>
      <P>
        You give general authorisation for us to engage subprocessors. The current list is on the{" "}
        <A href="/legal/subprocessors">Subprocessors</A> page. We will give at least 30 days&apos; notice by email before adding or
        replacing one. You may object on reasonable data-protection grounds within that period; if we cannot reasonably accommodate the
        objection, you may end the affected part of the Service and receive a refund of prepaid fees for the unused period. We impose
        data-protection obligations on each subprocessor that are no less protective than this DPA, and remain responsible for their
        performance.
      </P>

      <H id="transfers">7. International transfers</H>
      <P>
        Where Customer Data is transferred outside the European Economic Area to a country without an adequacy decision, we ensure an
        appropriate safeguard under Chapter V GDPR, such as the EU-US Data Privacy Framework or the Standard Contractual Clauses adopted by
        Commission Decision (EU) 2021/914, with supplementary measures where needed.
      </P>

      <H id="assistance">8. Assistance</H>
      <UL>
        <li>We will help you, taking into account the nature of the processing, to answer requests from data subjects exercising their rights. If we receive such a request directly, we will pass it to you.</li>
        <li>We will help you with data protection impact assessments and prior consultations with supervisory authorities where they relate to the Service.</li>
      </UL>

      <H id="breach">9. Personal data breaches</H>
      <P>
        We will notify you without undue delay, and in any case within 48 hours, after becoming aware of a personal data breach affecting
        Customer Data. We will give you the information you reasonably need to meet your own obligations under Articles 33 and 34 GDPR, and
        take reasonable steps to contain it.
      </P>

      <H id="deletion">10. Deletion and return</H>
      <P>
        When the Terms end, you can export your data for 30 days. After that we delete Customer Data, including from backups within a
        further 90 days, unless EU or member-state law requires us to keep it.
      </P>

      <H id="audits">11. Audits</H>
      <P>
        We will make available the information reasonably needed to demonstrate compliance with Article 28 GDPR, including our
        subprocessors&apos; certifications and audit reports. Where that is not enough, you may audit us, at your cost, no more than once a
        year, with at least 30 days&apos; written notice, during business hours, and under a confidentiality agreement.
      </P>

      <H id="liability">12. Liability and order of precedence</H>
      <P>
        The liability limits in the Terms apply to this DPA. If this DPA conflicts with the Terms on personal data, this DPA wins. If the
        Standard Contractual Clauses apply and conflict with this DPA, the Clauses win.
      </P>

      <H id="contact">13. Contact</H>
      <P>
        Data-protection questions: <ContactEmail />. If you need a countersigned copy of this DPA for your records, email us and we will
        send one.
      </P>
    </LegalShell>
  );
}
