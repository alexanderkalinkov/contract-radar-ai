import Link from "next/link";
import { Card, H2, PageHeader, btnPrimary } from "@/components/ui";
import { HelpCard, PasswordCard, ProfileCard, SignOutCard } from "@/components/help/AccountSettings";
import { getSession } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  return (
    <>
      <PageHeader eyebrow="Your profile, password and sign-in" title="My account" />
      <div className="flex max-w-[760px] flex-col gap-6">
        {session ? (
          <>
            <ProfileCard jobTitle={session.jobTitle} />
            <PasswordCard />
            <HelpCard />
            <SignOutCard />
          </>
        ) : (
          <>
            <Card className="flex flex-col gap-3 p-6" label="Demo mode">
              <H2>You&apos;re in demo mode</H2>
              <p className="m-0 text-sm text-muted">There are no accounts in demo mode: everything stays in this browser. Connect Supabase to sign in with your own account.</p>
              <Link href="/help" className={`${btnPrimary} w-fit`}>Open Help</Link>
            </Card>
            <HelpCard />
          </>
        )}
      </div>
    </>
  );
}
