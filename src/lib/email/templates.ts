// The emails the app sends itself (renewal alerts, team invites, test email).
// Supabase's own auth emails live in ./auth-templates.ts and share the same layout.
import { attr, bullets, C, callout, esc, FONT, link, linkFallback, p, renderEmail, renderText, small, type EmailBrand } from "./layout";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ---------- formatting ----------

const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const d = (iso: string) => new Date(iso + "T00:00:00Z");
export const fmtDate = (iso: string) => dateFmt.format(d(iso));

export function fmtMoney(n: number | null, currency?: string | null): string {
  if (n == null) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString("en-US")} ${currency ?? ""}`.trim();
  }
}

const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

// ---------- renewal alerts ----------

export type AlertKind = "notice" | "renewal" | "term_end";

export interface AlertItem {
  contractId: string;
  vendor: string;
  agreement: string | null;
  kind: AlertKind;
  date: string; // YYYY-MM-DD
  daysLeft: number;
  bucket: number; // which reminder this is: 90, 60, 30…
  annualFee: number | null;
  currency: string | null;
  renewalTermMonths: number | null;
  noticeDays: number | null;
  upliftCapPct: number | null;
  department: string | null;
}

export interface AlertEmailInput {
  workspace: string;
  /** e.g. "you're an admin of Northwind" or "you own the Sales department in Northwind". */
  reason: string;
  items: AlertItem[];
}

function what(i: AlertItem): string {
  if (i.kind === "notice") return "Last day to give notice";
  if (i.kind === "renewal") return `Auto-renews${i.renewalTermMonths ? ` for ${i.renewalTermMonths} months` : ""}`;
  return "Contract term ends";
}

function tone(days: number) {
  if (days <= 7) return { bg: C.urgentSoft, fg: C.urgent };
  if (days <= 30) return { bg: C.warnSoft, fg: C.warn };
  return { bg: C.brandSoft, fg: C.brand };
}

function itemRow(b: EmailBrand, i: AlertItem): string {
  const t = tone(i.daysLeft);
  const url = `${b.appUrl}/contracts/${i.contractId}`;
  const meta = [inDays(i.daysLeft).replace(/^./, (c) => c.toUpperCase()), fmtMoney(i.annualFee, i.currency) && `${fmtMoney(i.annualFee, i.currency)}/yr`, i.department]
    .filter(Boolean)
    .map((x) => esc(x as string))
    .join(" &middot; ");
  return `<tr><td style="padding:14px 0;border-top:1px solid ${C.lineSoft};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top" width="56" style="width:56px;padding-right:14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="52"><tr>
        <td align="center" style="background:${t.bg};border-radius:10px;padding:7px 0 6px;font-family:${FONT};">
          <div style="font-size:10px;line-height:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${t.fg};">${monFmt.format(d(i.date))}</div>
          <div style="font-size:20px;line-height:24px;font-weight:700;color:${t.fg};">${d(i.date).getUTCDate()}</div>
        </td>
      </tr></table>
    </td>
    <td valign="top" style="font-family:${FONT};">
      <div style="font-size:15px;line-height:22px;font-weight:600;color:${C.ink};">${esc(i.vendor)}${i.agreement ? `<span style="font-weight:400;color:${C.muted};"> &middot; ${esc(i.agreement)}</span>` : ""}</div>
      <div style="font-size:14px;line-height:21px;color:${C.ink2};">${esc(what(i))}: <strong>${esc(fmtDate(i.date))}</strong></div>
      <div style="font-size:13px;line-height:20px;color:${C.muted};">${meta}</div>
    </td>
    <td valign="middle" align="right" style="padding-left:10px;font-family:${FONT};font-size:13px;white-space:nowrap;">
      <a href="${attr(url)}" target="_blank" style="color:${C.brand};font-weight:600;text-decoration:none;">Open&nbsp;&rsaquo;</a>
    </td>
  </tr></table>
</td></tr>`;
}

export function renewalAlertEmail(b: EmailBrand, input: AlertEmailInput): RenderedEmail {
  const items = [...input.items].sort((x, y) => x.date.localeCompare(y.date));
  const one = items.length === 1 ? items[0] : null;
  const soonest = items[0];

  let subject: string;
  let heading: string;
  let intro: string;
  let advice: string;
  if (one) {
    const fee = fmtMoney(one.annualFee, one.currency);
    if (one.kind === "notice") {
      subject = `${one.vendor}: ${one.daysLeft} days left to give notice`;
      heading = `Give ${one.vendor} notice by ${fmtDate(one.date)}`;
      intro = `This is your ${one.bucket}-day reminder. ${esc(one.agreement || `Your ${one.vendor} contract`)} renews automatically unless written notice reaches ${esc(one.vendor)} by <strong>${esc(fmtDate(one.date))}</strong>${one.noticeDays ? ` (${one.noticeDays} days' notice required)` : ""}.`;
    } else if (one.kind === "renewal") {
      subject = `${one.vendor} auto-renews in ${one.daysLeft} days`;
      heading = `${one.vendor} renews on ${fmtDate(one.date)}`;
      intro = `This is your ${one.bucket}-day reminder. ${esc(one.agreement || `Your ${one.vendor} contract`)} renews${one.renewalTermMonths ? ` for another ${one.renewalTermMonths} months` : ""} on <strong>${esc(fmtDate(one.date))}</strong>${fee ? `, currently ${esc(fee)} a year` : ""}.`;
    } else {
      subject = `${one.vendor} contract ends in ${one.daysLeft} days`;
      heading = `${one.vendor} ends on ${fmtDate(one.date)}`;
      intro = `This is your ${one.bucket}-day reminder. ${esc(one.agreement || `Your ${one.vendor} contract`)} ends on <strong>${esc(fmtDate(one.date))}</strong> and does not renew on its own. If the team still needs it, start the renewal conversation now.`;
    }
    advice =
      one.kind === "term_end"
        ? "Check who still uses it and how many seats you really need before you agree new terms."
        : `Decide whether to renew as is, renegotiate price and seats, or cancel.${one.upliftCapPct != null ? ` Your contract caps renewal increases at <strong>${one.upliftCapPct}%</strong>, so push back on anything above that.` : ""}`;
  } else {
    const notices = items.filter((i) => i.kind === "notice").length;
    subject = notices
      ? `${notices} notice deadline${notices > 1 ? "s" : ""} coming up: ${soonest.vendor} first, ${inDays(soonest.daysLeft)}`
      : `${items.length} contract renewals coming up: ${soonest.vendor} first, ${inDays(soonest.daysLeft)}`;
    heading = `${items.length} contract dates need a decision`;
    intro = `Here is what is coming up in <strong>${esc(input.workspace)}</strong>. The first one is ${esc(soonest.vendor)}, ${esc(inDays(soonest.daysLeft))}.`;
    advice = "For each one, decide whether to renew as is, renegotiate price and seats, or cancel. Notice usually has to be in writing, so leave time for it.";
  }

  const list = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;border-bottom:1px solid ${C.lineSoft};">
${items.map((i) => itemRow(b, i)).join("\n")}
</table>`;

  const ctaUrl = one ? `${b.appUrl}/contracts/${one.contractId}` : `${b.appUrl}/calendar`;
  const html = renderEmail(b, {
    preheader: one ? `${what(one)}: ${fmtDate(one.date)}. ${one.vendor}.` : `${items.length} dates coming up, starting with ${soonest.vendor} ${inDays(soonest.daysLeft)}.`,
    eyebrow: soonest.daysLeft <= 7 ? "Renewal alert · this week" : `Renewal alert · ${one ? `${one.bucket}-day reminder` : "coming up"}`,
    heading,
    body: p(intro) + list + callout(advice, soonest.daysLeft <= 30 ? "warn" : "info"),
    cta: { label: one ? "Review the contract" : "Open the renewal calendar", url: ctaUrl },
    after: small(`${b.name} found these dates in your uploaded contracts. ${link(`${b.appUrl}/calendar`, "See every upcoming date")}.`),
    footer: `You're getting this because ${esc(input.reason)}.<br>Admins can change reminders in ${link(`${b.appUrl}/settings`, "Workspace settings")}.`,
  });

  const text = renderText(
    b,
    [
      heading,
      "",
      intro.replace(/<[^>]+>/g, ""),
      "",
      ...items.map((i) => `• ${i.vendor}${i.agreement ? ` (${i.agreement})` : ""}: ${what(i)} ${fmtDate(i.date)}, ${inDays(i.daysLeft)}${i.annualFee != null ? `, ${fmtMoney(i.annualFee, i.currency)}/yr` : ""}\n  ${b.appUrl}/contracts/${i.contractId}`),
      "",
      advice.replace(/<[^>]+>/g, ""),
      "",
      `${one ? "Review the contract" : "Open the renewal calendar"}: ${ctaUrl}`,
    ],
    `You're getting this because ${input.reason}. Admins can change reminders in Workspace settings: ${b.appUrl}/settings`,
  );
  return { subject, html, text };
}

// ---------- team invite ----------

export interface InviteEmailInput {
  workspace: string;
  inviter: string | null;
  department: string | null;
  role: "owner" | "member";
  actionUrl: string;
  /** true when the person already has an account and the link just signs them in. */
  existingUser?: boolean;
}

export function inviteEmail(b: EmailBrand, i: InviteEmailInput): RenderedEmail {
  const who = i.inviter ? esc(i.inviter) : "Your team";
  const as =
    i.role === "owner" ? " as an admin" : i.department ? ` as the owner of the <strong>${esc(i.department)}</strong> department` : "";
  const subject = `${i.inviter ?? "Your team"} invited you to ${i.workspace} on ${b.name}`;
  const jobs =
    i.role === "owner"
      ? ["See every software contract, renewal date and price increase in one place", "Get reminders 90, 60 and 30 days before each notice deadline", "Invite department owners and see what each team pays for"]
      : ["Confirm the tools your department pays for (takes about 2 minutes)", "Answer 4 quick questions per tool so nothing gets cut by mistake", "Get a reminder before any of your tools renews"];
  const html = renderEmail(b, {
    preheader: `${i.inviter ?? "Your team"} added you to ${i.workspace}. Accept to get started.`,
    eyebrow: "You're invited",
    heading: `Join ${i.workspace} on ${b.name}`,
    body:
      p(`${who} invited you to join <strong>${esc(i.workspace)}</strong>${as}. ${esc(b.name)} tracks your company's software contracts so nobody misses a renewal or overpays at one.`) +
      p("Here's what you'll be able to do:", "margin-bottom:10px;") +
      bullets(jobs),
    cta: { label: i.existingUser ? `Open ${i.workspace}` : "Accept invite", url: i.actionUrl },
    after: linkFallback(i.actionUrl) + small("This link works once and expires in 24 hours. If it has expired, ask for a new invite."),
    footer: `${who} invited you to ${esc(i.workspace)}. If you weren't expecting this, you can ignore this email.`,
  });
  const text = renderText(
    b,
    [
      `Join ${i.workspace} on ${b.name}`,
      "",
      `${i.inviter ?? "Your team"} invited you to join ${i.workspace}${as.replace(/<[^>]+>/g, "")}.`,
      "",
      ...jobs.map((j) => `• ${j}`),
      "",
      `${i.existingUser ? "Open the workspace" : "Accept the invite"}: ${i.actionUrl}`,
      "This link works once and expires in 24 hours.",
    ],
    "If you weren't expecting this, you can ignore this email.",
  );
  return { subject, html, text };
}

// ---------- test ----------

export function testEmail(b: EmailBrand, to: string): RenderedEmail {
  const html = renderEmail(b, {
    preheader: "Your email setup works.",
    eyebrow: "Email check",
    heading: "Your email setup works",
    body:
      p(`This is a test from ${esc(b.name)} to <strong>${esc(to)}</strong>. Renewal alerts and team invites will look like this and come from the same address.`) +
      callout("Reminders go out 90, 60 and 30 days before each notice deadline and renewal date, to the department owner and the workspace admins.", "good"),
    cta: { label: "Open the renewal calendar", url: `${b.appUrl}/calendar` },
    footer: "You asked for this test email from Workspace settings.",
  });
  return { subject: `${b.name} email check`, html, text: renderText(b, ["Your email setup works.", `${b.appUrl}/calendar`], "You asked for this test email from Workspace settings.") };
}
