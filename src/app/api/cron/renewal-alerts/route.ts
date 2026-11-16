import { NextResponse } from "next/server";
import { runRenewalAlerts } from "@/lib/server/renewal-alerts";

// Called once a day by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
// Manual run:  curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/renewal-alerts?dry=1"
//   ?dry=1             show what would be sent, send nothing
//   ?today=2027-01-15  pretend it's another day (testing)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret) {
    return NextResponse.json({ error: "Set CRON_SECRET in the environment to enable the renewal alert job." }, { status: 503 });
  }
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(req.url);
  const today = url.searchParams.get("today");
  try {
    const report = await runRenewalAlerts({
      dryRun: url.searchParams.get("dry") === "1",
      today: today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined,
    });
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
