import { NextResponse } from "next/server";
import { toISO } from "@/lib/engine";
import { authTemplates } from "@/lib/email/auth-templates";
import { brand } from "@/lib/email/brand";
import { sampleAlertItems } from "@/lib/email/samples";
import { inboundReceiptEmail, inviteEmail, renewalAlertEmail, testEmail } from "@/lib/email/templates";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession } from "@/lib/server/workspace";

// Shows any email in the browser with sample data: /api/email-preview?t=renewal
// t = renewal | renewal-digest | invite | test | inbox-receipt | confirm-signup | invite-user | magic-link | reset-password | change-email | reauthentication
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = isSupabaseConfigured ? await getSession().catch(() => null) : null;
  if (isSupabaseConfigured && !session && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Sign in to preview emails." }, { status: 401 });
  }
  const url = new URL(req.url);
  const t = url.searchParams.get("t") ?? "renewal";
  const b = brand(url.origin);
  const email = session?.email || "dana@northwind.example";
  const workspace = session?.workspace.name || "Northwind Logistics";
  const items = sampleAlertItems(toISO(new Date()));

  let html: string | undefined;
  if (t === "renewal") html = renewalAlertEmail(b, { workspace, reason: `you own the Sales department in ${workspace} on ${b.name}`, items: [items[0]] }).html;
  else if (t === "renewal-digest") html = renewalAlertEmail(b, { workspace, reason: `you're an admin of ${workspace} on ${b.name}`, items }).html;
  else if (t === "invite")
    html = inviteEmail(b, { workspace, inviter: "Alex Morgan", department: "Marketing", role: "member", actionUrl: `${b.appUrl}/auth/confirm` }).html;
  else if (t === "test") html = testEmail(b, email).html;
  else if (t === "inbox-receipt")
    html = inboundReceiptEmail(b, {
      workspace,
      address: `northwind-logistics.k3x9q2m7ab@in.example.com`,
      subject: "Fwd: Your Salesforce renewal quote",
      added: [
        { vendor: "Salesforce", agreement: "Order Form Q-04417", file: "Salesforce_OrderForm_Q-04417.pdf", noticeDeadline: items[0]?.date ?? null, termEnd: null, annualFee: 319200, currency: "USD", url: `${b.appUrl}/contracts` },
      ],
      skipped: [{ file: "pricing.xlsx", reason: "Not a PDF or Word (.docx) file" }],
      problem: null,
    }).html;
  else {
    const tpl = authTemplates(b.name).find((x) => x.file === `${t}.html`);
    html = tpl?.html
      .replaceAll("{{ .SiteURL }}", b.appUrl)
      .replaceAll("{{ .ConfirmationURL }}", `${b.appUrl}/login`)
      .replaceAll("{{ .Email }}", email)
      .replaceAll("{{ .NewEmail }}", "new." + email)
      .replaceAll("{{ .Token }}", "482913");
  }
  if (!html) return NextResponse.json({ error: `Unknown template "${t}".` }, { status: 404 });
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
