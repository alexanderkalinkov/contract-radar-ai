"use client";

import Link from "next/link";
import { btnPrimary, Card, H2 } from "@/components/ui";
import { latestSurveys } from "@/lib/team/insights";
import { useTeam } from "@/lib/team/useTeam";

/** On the Savings page: nudges admins to run setup, and department owners to answer their surveys. */
export function TeamSetupBanner() {
  const { raw, isAdmin, me } = useTeam();
  if (!raw || !me) return null;

  if (isAdmin && !raw.workspace.onboarded_at) {
    return (
      <Card label="Set up your team" className="flex flex-wrap items-center justify-between gap-4 border-brand-line bg-brand-soft p-5">
        <div className="flex flex-col gap-1">
          <H2>Bring in your department heads</H2>
          <span className="text-[13px] text-ink-2">
            Add departments, invite one owner each, and they confirm their tools and say why they use them. About 10 minutes.
          </span>
        </div>
        <Link href="/setup" className={btnPrimary}>Start team setup</Link>
      </Card>
    );
  }

  const answered = latestSurveys(raw.surveys);
  const mine = raw.tools.filter((t) => (isAdmin ? !t.department_id : t.department_id === me.department_id) && !answered.has(t.id));
  if (!isAdmin && me.department_id && mine.length) {
    return (
      <Card label="Your tools" className="flex flex-wrap items-center justify-between gap-4 border-brand-line bg-brand-soft p-5">
        <div className="flex flex-col gap-1">
          <H2>{mine.length} of your team&apos;s tools need answers</H2>
          <span className="text-[13px] text-ink-2">4 quick questions each: what it&apos;s for, how critical it is, the fallback, and seats.</span>
        </div>
        <Link href="/tools" className={btnPrimary}>Answer now</Link>
      </Card>
    );
  }
  return null;
}
