import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runRenewalAlerts } from "@/lib/server/renewal-alerts";
import { recordJobRun } from "@/lib/server/platform";

// Called once a day by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
// Manual run:  curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/renewal-alerts?dry=1"
//   ?dry=1             show what would be sent, send nothing
//   ?today=2027-01-15  pretend it's another day (testing)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Constant-time comparison, so the secret can't be guessed one character at a time from response timings. */
function sameSecret(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret) {
    return NextResponse.json({ error: "Set CRON_SECRET in the environment to enable the renewal alert job." }, { status: 503 });
  }
  if (!sameSecret(auth ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(req.url);
  const today = url.searchParams.get("today");
  const dry = url.searchParams.get("dry") === "1";
  try {
    const report = await runRenewalAlerts({
      dryRun: dry,
      today: today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined,
    });
    if (!dry) {
      const failed = report.emails.filter((e) => !e.sent).length;
      await recordJobRun("renewal-alerts", failed === 0, {
        workspaces: report.workspaces,
        contractsChecked: report.contractsChecked,
        emails: report.emails.length,
        failed,
        dryRun: report.dryRun,
      });
    }
    return NextResponse.json(report);
  } catch (e) {
    if (!dry) await recordJobRun("renewal-alerts", false, {}, (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
