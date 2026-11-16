import type { Metadata } from "next";
import { A, ContactEmail, H, LegalShell, P, UL } from "@/components/legal/LegalShell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy · Contract Radar",
  description: "How Contract Radar collects, uses and protects personal data, under the EU GDPR.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      current="/legal/privacy"
      title="Privacy policy"
      intro={`This policy explains how ${LEGAL.companyName} ("we", "us") handles personal data when you visit ${LEGAL.appUrl}, create an account, or use Contract Radar (the "Service"). Contract Radar is a business tool sold to companies. It is not intended for consumers.`}
    >
      <H id="who">1. Who we are</H>
      <P>
        {LEGAL.companyName}, company ID {LEGAL.companyId}, registered at {LEGAL.address}. For anything about privacy, write to <ContactEmail />.
        We have not appointed a data protection officer because the GDPR does not require one for our processing; the contact above handles
        all data-protection requests.
      </P>

      <H id="roles">2. Controller or processor</H>
      <P>We play two different roles, and the rules differ for each:</P>
      <UL>
        <li>
          <strong>Controller</strong> for data about our own customers and visitors: account details, billing contacts, website and
          usage logs, and sales or support emails. This policy covers that data.
        </li>
        <li>
          <strong>Processor</strong> for the data our customers put into their workspace (&quot;Customer Data&quot;): uploaded contracts,
          vendor and tool lists, team members, and data read from connected accounting or sign-in systems. We process Customer Data only
          on the customer&apos;s instructions, under our <A href="/legal/dpa">Data processing agreement</A>. If your employer uses
          Contract Radar and you have a question about your data in their workspace, please contact your employer first.
        </li>
      </UL>

      <H id="data">3. What we collect and why</H>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[600px] border-collapse text-left text-sm">
          <caption className="sr-only">Personal data, purpose and legal basis</caption>
          <thead className="bg-canvas text-xs font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="px-3 py-2.5">Data</th>
              <th scope="col" className="px-3 py-2.5">Why we use it</th>
              <th scope="col" className="px-3 py-2.5">Legal basis (GDPR Art. 6)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Name, work email, password (stored hashed), workspace and role", "Create and secure your account, let teammates invite you", "Contract (6(1)(b))"],
              ["Onboarding answers (company size, role, goals)", "Set up your workspace and tailor suggestions", "Contract (6(1)(b))"],
              ["Billing contact, company name, VAT number, invoices. Card details go straight to Stripe; we never see them", "Charge for the subscription and keep tax records", "Contract (6(1)(b)) and legal obligation (6(1)(c))"],
              ["IP address, browser, pages requested, error logs", "Run the Service, keep it secure, fix problems", "Legitimate interests (6(1)(f)): security and reliability"],
              ["Emails you send us, call notes", "Answer questions, support and sales", "Legitimate interests (6(1)(f)) or steps before a contract (6(1)(b))"],
              ["Product emails you receive (renewal reminders, invites)", "Deliver the reminders you switched on", "Contract (6(1)(b))"],
            ].map(([d, w, b]) => (
              <tr key={d} className="border-t border-line align-top">
                <td className="px-3 py-2.5">{d}</td>
                <td className="px-3 py-2.5">{w}</td>
                <td className="px-3 py-2.5">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P>
        We do not sell personal data, we do not use it for advertising, and we do not make decisions about people that have legal or
        similarly significant effects based solely on automated processing.
      </P>

      <H id="ai">4. AI features</H>
      <P>
        Contract Radar uses Claude, an AI model from Anthropic, to read uploaded contracts, pull out terms such as renewal dates and price
        caps, draft renegotiation emails, and name vendors found in accounting data. Contract text is sent to Anthropic&apos;s API for this
        and is not used by Anthropic to train its models under its commercial terms. AI output can be wrong: always check important dates
        and amounts against the contract itself.
      </P>

      <H id="google">5. Data from Google, Microsoft and accounting systems</H>
      <P>
        If an admin in your company connects Google Workspace, Microsoft Entra ID, QuickBooks or Xero, we read only what is needed to find
        the software your company uses: user names and emails, which apps people sign in to and when, and vendor names, amounts and dates
        from bills and bank transactions. Access is read-only. We do not read email, files, chats or calendars. Sign-in tokens are stored
        encrypted, and an admin can disconnect at any time, which deletes the stored tokens.
      </P>
      <P>
        Contract Radar&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <A href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</A>, including the
        Limited Use requirements. We do not use Google user data to develop, improve or train AI or machine-learning models, we do not
        transfer it to third parties except as needed to provide the Service or as required by law, and no person at {LEGAL.companyName}{" "}
        reads it unless you ask us to for support, it is needed for security, or the law requires it. User details from Google or
        Microsoft are never sent to Anthropic; only vendor and app names are.
      </P>

      <H id="sharing">6. Who we share data with</H>
      <P>
        We use a small number of service providers (subprocessors) to host and run the Service, such as Supabase for the database (in
        Frankfurt), Vercel for hosting, Anthropic for AI, Resend for email and Stripe for payments. The full, current list, with what each
        one does and where, is on the <A href="/legal/subprocessors">Subprocessors</A> page. We may also disclose data when the law
        requires it, to protect our rights, or to a buyer if the business is sold, who would be bound by this policy.
      </P>

      <H id="transfers">7. Transfers outside the EU</H>
      <P>
        Our main database is in the EU. Some providers are based in the United States. Where data leaves the European Economic Area we rely
        on the EU-US Data Privacy Framework where the provider is certified, or on the European Commission&apos;s Standard Contractual
        Clauses, with supplementary measures such as encryption in transit and at rest. You can ask us for a copy of these safeguards.
      </P>

      <H id="retention">8. How long we keep data</H>
      <UL>
        <li>Account and workspace data: while the account is active. When a workspace is deleted we erase it within 30 days, and from backups within a further 90 days.</li>
        <li>Uploaded contract files: until the user or workspace deletes them.</li>
        <li>Invoices and billing records: 10 years, as Bulgarian accounting law requires.</li>
        <li>Server and security logs: up to 90 days.</li>
        <li>Support and sales emails: up to 3 years after our last contact.</li>
      </UL>

      <H id="security">9. Security</H>
      <P>
        Data is encrypted in transit (TLS) and at rest. Each workspace is separated by database row-level security, so one customer cannot
        read another&apos;s data. Connector tokens are encrypted with a separate key. Access to production systems is limited to the people
        who need it. No system is perfectly secure; if a breach affects your personal data, we will tell you and the authorities as the
        GDPR requires.
      </P>

      <H id="rights">10. Your rights</H>
      <P>
        Under the GDPR you can ask to access, correct, delete or export your personal data, to restrict or object to our use of it, and to
        withdraw consent where we rely on it. Write to <ContactEmail />. We answer within one month. You can also complain to the Bulgarian
        Commission for Personal Data Protection (<A href="https://www.cpdp.bg/en/">cpdp.bg</A>) or the authority where you live or work.
      </P>

      <H id="cookies">11. Cookies</H>
      <P>
        We use only cookies that are strictly necessary for the Service: a sign-in session cookie from Supabase and a cookie that remembers
        which workspace you have open. We do not use advertising or analytics cookies, so we do not show a cookie banner. If that changes, we
        will ask for consent first.
      </P>

      <H id="changes">12. Changes</H>
      <P>
        We will update the date at the top when this policy changes, and email account owners about any significant change before it
        applies.
      </P>
    </LegalShell>
  );
}
