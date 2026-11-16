import Link from "next/link";
import { Card, H2, PageHeader } from "@/components/ui";
import { HelpVideo } from "@/components/help/HelpVideo";
import { SupportForm } from "@/components/help/SupportForm";
import { supportEmail } from "@/lib/server/help";

export const dynamic = "force-dynamic";

const GUIDES = [
  { q: "How do I add contracts?", a: "Upload PDFs on Contracts, bulk-import a ZIP, or email them to your workspace inbox (address in Workspace settings).", href: "/upload" },
  { q: "Who gets renewal reminders?", a: "The department owner and workspace admins, 90, 60 and 30 days before each notice deadline.", href: "/calendar" },
  { q: "How do I invite my team?", a: "Admins invite people from the Team page and pick their role and department.", href: "/team" },
  { q: "A term looks wrong. What now?", a: "Open the contract, check the source quote, and press Correct to fix it. Tell us below if it keeps happening.", href: "/contracts" },
];

/** Help: the onboarding tour, a few quick answers, and a form that emails support. */
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ from?: string; topic?: string }> }) {
  const { from, topic } = await searchParams;
  const fromPage = from && from.startsWith("/") && !from.startsWith("//") ? from.slice(0, 300) : undefined;
  const inbox = supportEmail();
  return (
    <>
      <PageHeader eyebrow="Learn the app, or tell us what's wrong" title="Help & support" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-4 p-6" label="Tour">
            <div className="flex flex-col gap-1">
              <H2>Take the 6-minute tour</H2>
              <p className="m-0 text-sm text-muted">Setting up your company, roles, adding contracts, savings ideas, price hikes, renewal alerts and approvals.</p>
            </div>
            <HelpVideo />
          </Card>
          <Card className="flex flex-col gap-1 p-6" label="Quick answers">
            <H2 className="mb-3">Quick answers</H2>
            {GUIDES.map((g) => (
              <div key={g.q} className="flex flex-col gap-1 border-t border-line-soft py-3 first-of-type:border-t-0">
                <Link href={g.href} className="text-[15px] font-semibold text-ink hover:text-brand">{g.q}</Link>
                <p className="m-0 text-sm text-muted">{g.a}</p>
              </div>
            ))}
          </Card>
        </div>
        <Card className="flex h-fit flex-col gap-4 p-6" label="Contact support">
          <div id="support" className="flex scroll-mt-6 flex-col gap-1">
            <H2>Contact support</H2>
            <p className="m-0 text-sm text-muted">
              Something broken, confusing or missing? Tell us and we&apos;ll get on it.
              {inbox && (
                <>
                  {" "}You can also email <a href={`mailto:${inbox}`} className="font-semibold text-brand underline">{inbox}</a>.
                </>
              )}
            </p>
          </div>
          {inbox ? (
            <SupportForm fromPage={fromPage} topic={topic} />
          ) : (
            <p role="status" className="m-0 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-text">
              The support inbox isn&apos;t set up yet. An admin needs to set SUPPORT_EMAIL (see docs/help-and-support.md).
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
