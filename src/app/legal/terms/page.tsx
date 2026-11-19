import type { Metadata } from "next";
import { pageMeta } from "@/lib/page-meta";
import { A, ContactEmail, H, LegalShell, P, UL } from "@/components/legal/LegalShell";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMeta({ path: "/legal/terms", title: "Terms of service", description: "The agreement between Outflow and the businesses that use it." });

export default function TermsPage() {
  return (
    <LegalShell
      current="/legal/terms"
      title="Terms of service"
      intro={`These terms are an agreement between ${LEGAL.companyName} ("we", "us") and the business that creates an Outflow workspace ("Customer", "you"). By creating an account or clicking to accept, you confirm that you have authority to bind that business.`}
    >
      <H id="service">1. The Service</H>
      <P>
        Outflow (the &quot;Service&quot;) helps businesses track their software contracts: it reads uploaded contracts, finds tools
        in connected systems, reminds you of renewal and notice dates, flags price increases, and suggests savings. We may improve and
        change the Service over time, and will not materially reduce its core features during a paid term.
      </P>

      <H id="business">2. Business use only</H>
      <P>
        The Service is for businesses and professionals acting in the course of their trade. It is not offered to consumers, and consumer
        protection rules, including the right of withdrawal for distance contracts, do not apply.
      </P>

      <H id="accounts">3. Accounts and your team</H>
      <UL>
        <li>You are responsible for everyone you invite to your workspace and for keeping sign-in details secure.</li>
        <li>The person who creates the workspace is its owner and can manage members, billing and connections.</li>
        <li>Tell us promptly at <ContactEmail /> if you suspect unauthorised access.</li>
      </UL>

      <H id="trial">4. Trial, plans and payment</H>
      <UL>
        <li>New workspaces get a free {TRIAL_DAYS}-day trial. No card is needed. When it ends, the workspace becomes read-only until you choose a plan; your data is kept.</li>
        <li>Paid plans are billed in advance, monthly or yearly, through Stripe, and renew automatically for the same period unless cancelled before the renewal date.</li>
        <li>Prices are shown before checkout and exclude VAT. Reverse charge applies to EU business customers with a valid VAT number.</li>
        <li>You can cancel at any time in Billing; the plan stays active until the end of the period you have paid for. Fees already paid are not refunded, except where the law requires it or we say otherwise in writing.</li>
        <li>We may change prices for future periods with at least 30 days&apos; notice by email.</li>
        <li>If a payment fails and is not fixed within 14 days, we may suspend the workspace until it is.</li>
      </UL>

      <H id="data">5. Your data</H>
      <P>
        You keep all rights to the data you put in the Service, including uploaded contracts and data read from connected systems
        (&quot;Customer Data&quot;). You give us the right to use Customer Data only to provide, secure and support the Service for you. We
        process personal data in Customer Data as your processor under our <A href="/legal/dpa">Data processing agreement</A>, which forms
        part of these terms. You confirm that you are allowed to upload the contracts you upload and to connect the systems you connect.
      </P>
      <P>
        You can export or delete your data at any time. After the agreement ends we keep Customer Data for 30 days so you can export it,
        then delete it, unless the law requires us to keep it.
      </P>

      <H id="ai">6. AI output is not advice</H>
      <P>
        The Service uses AI to read contracts and draft emails. Its output can be incomplete or wrong. It is a tool to help you, not legal,
        financial or procurement advice. Check renewal dates, notice periods and amounts against the original contract before you rely on
        them, and review any email before you send it. We are not responsible for a missed deadline or a decision made on AI output alone.
      </P>

      <H id="use">7. Acceptable use</H>
      <P>You will not:</P>
      <UL>
        <li>break the law, or upload data you have no right to share;</li>
        <li>try to access another customer&apos;s data, probe or overload the Service, or get around its limits or security;</li>
        <li>copy, resell or reverse engineer the Service, or use it to build a competing product;</li>
        <li>upload malware or content that infringes someone else&apos;s rights.</li>
      </UL>
      <P>We may suspend access that breaks these rules or puts the Service or other customers at risk, and will tell you why.</P>

      <H id="third-party">8. Connected services</H>
      <P>
        When you connect Google Workspace, Microsoft, QuickBooks, Xero or another service, your use of that service stays under its own
        terms. We read from it only as described in our <A href="/legal/privacy">Privacy policy</A>, and are not responsible for its
        availability or accuracy.
      </P>

      <H id="ip">9. Our rights</H>
      <P>
        We own the Service, its software and design. You get a non-exclusive, non-transferable right to use it for your internal business
        during your subscription. If you send us feedback, we may use it freely.
      </P>

      <H id="confidentiality">10. Confidentiality</H>
      <P>
        Each side will keep the other&apos;s non-public information confidential and use it only for this agreement. Your contracts and
        pricing are your confidential information.
      </P>

      <H id="availability">11. Availability</H>
      <P>
        We aim to keep the Service available at all times but do not promise it will be uninterrupted or error-free. We will try to give
        notice of planned maintenance. Reminders depend on email delivery, which we cannot fully control, so keep important deadlines in
        your own calendar too (the Service can export them).
      </P>

      <H id="liability">12. Liability</H>
      <UL>
        <li>The Service is provided &quot;as is&quot; to the extent the law allows.</li>
        <li>Neither side is liable for lost profits, lost savings, lost revenue or indirect or consequential loss.</li>
        <li>Each side&apos;s total liability under this agreement is limited to the fees you paid in the 12 months before the claim (or EUR 100 during a free trial).</li>
        <li>These limits do not apply to liability that cannot be limited by law, including for intentional misconduct or gross negligence, or to your payment obligations.</li>
      </UL>

      <H id="term">13. Term and ending</H>
      <P>
        This agreement runs while you have a workspace. You can end it by cancelling and deleting the workspace. We can end it with 30
        days&apos; notice, or immediately if you seriously break these terms and do not fix it within 14 days of notice. If we end it
        without cause, we refund any prepaid fees for the unused period.
      </P>

      <H id="changes">14. Changes to these terms</H>
      <P>
        We may update these terms. For a significant change we will email the workspace owner at least 30 days before it applies. If you do
        not agree, you can cancel before then.
      </P>

      <H id="law">15. Law and disputes</H>
      <P>
        These terms are governed by the laws of the Republic of Bulgaria. Disputes go to the competent courts in Sofia, Bulgaria. Before
        going to court, each side will first try to settle the dispute in good faith for 30 days.
      </P>

      <H id="contact">16. Contact</H>
      <P>
        {LEGAL.companyName}, company ID {LEGAL.companyId}, {LEGAL.address}. Email: <ContactEmail />.
      </P>
    </LegalShell>
  );
}
