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
  /** The renewal price compared with the current one, when a renewal quote or signed renewal was uploaded. */
  priceChange?: {
    source: "quote" | "renewal";
    previousFee: number;
    newFee: number;
    deltaAbs: number;
    deltaPct: number;
    capPct: number | null;
    overCap: number;
  } | null;
  /** A clause that raises the price on its own, e.g. "Fees rise 5% each year". */
  escalator?: string | null;
}

/** "Renewal quote is up 9% (+$28,728), $12,768 over your 5% cap" */
export function priceLine(i: AlertItem): string | null {
  const p = i.priceChange;
  if (p && p.deltaAbs > 0) {
    const head = `${p.source === "quote" ? "Renewal quote is up" : "Renewal went up"} ${p.deltaPct}% (+${fmtMoney(p.deltaAbs, i.currency)}/yr)`;
    if (p.capPct == null) return `${head}, and the contract has no cap`;
    return p.overCap > 0 ? `${head}, ${fmtMoney(p.overCap, i.currency)} over your ${p.capPct}% cap` : `${head}, within your ${p.capPct}% cap`;
  }
  if (i.escalator) return `Built-in price increase: ${i.escalator}`;
  return null;
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
      <div style="font-size:13px;line-height:20px;color:${C.muted};">${meta}</div>${
        priceLine(i) ? `
      <div style="font-size:13px;line-height:20px;font-weight:600;color:${C.warn};">${esc(priceLine(i)!)}</div>` : ""
      }
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
    const pc = one.priceChange;
    advice =
      pc && pc.deltaAbs > 0
        ? pc.capPct != null && pc.overCap > 0
          ? `${pc.source === "quote" ? "The renewal quote" : "The renewal"} is <strong>${pc.deltaPct}%</strong> higher (${esc(fmtMoney(pc.previousFee, one.currency))} &rarr; ${esc(fmtMoney(pc.newFee, one.currency))}), but your contract caps increases at <strong>${pc.capPct}%</strong>. ${pc.source === "quote" ? `Push back on the <strong>${esc(fmtMoney(pc.overCap, one.currency))}</strong> over the cap before the deadline: the contract page drafts the email for you.` : `Ask for a credit of <strong>${esc(fmtMoney(pc.overCap, one.currency))}</strong>.`}`
          : `${pc.source === "quote" ? "The renewal quote" : "The renewal"} is <strong>${pc.deltaPct}%</strong> higher (${esc(fmtMoney(pc.previousFee, one.currency))} &rarr; ${esc(fmtMoney(pc.newFee, one.currency))}). ${pc.capPct == null ? "Nothing in the contract limits increases, so negotiate it down and ask for a cap." : `That's within your ${pc.capPct}% cap, but it's still worth asking them to hold the price.`}`
        : one.kind === "term_end"
          ? "Check who still uses it and how many seats you really need before you agree new terms."
          : `Decide whether to renew as is, renegotiate price and seats, or cancel.${one.upliftCapPct != null ? ` Your contract caps renewal increases at <strong>${one.upliftCapPct}%</strong>, so push back on anything above that.` : ""}${one.escalator ? ` Watch out: ${esc(one.escalator.replace(/^./, (x) => x.toLowerCase()))}.` : ""}`;
  } else {
    const notices = items.filter((i) => i.kind === "notice").length;
    subject = notices
      ? `${notices} notice deadline${notices > 1 ? "s" : ""} coming up: ${soonest.vendor} first, ${inDays(soonest.daysLeft)}`
      : `${items.length} contract renewals coming up: ${soonest.vendor} first, ${inDays(soonest.daysLeft)}`;
    heading = `${items.length} contract dates need a decision`;
    intro = `Here is what is coming up in <strong>${esc(input.workspace)}</strong>. The first one is ${esc(soonest.vendor)}, ${esc(inDays(soonest.daysLeft))}.`;
    const hikes = items.filter((i) => i.priceChange && i.priceChange.deltaAbs > 0);
    advice =
      "For each one, decide whether to renew as is, renegotiate price and seats, or cancel. Notice usually has to be in writing, so leave time for it." +
      (hikes.length ? ` ${hikes.length === 1 ? `${esc(hikes[0].vendor)} has` : `${hikes.length} of them have`} a higher renewal price: push back before the notice deadline.` : "");
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
      ...items.map((i) => `• ${i.vendor}${i.agreement ? ` (${i.agreement})` : ""}: ${what(i)} ${fmtDate(i.date)}, ${inDays(i.daysLeft)}${i.annualFee != null ? `, ${fmtMoney(i.annualFee, i.currency)}/yr` : ""}${priceLine(i) ? `\n  ${priceLine(i)}` : ""}\n  ${b.appUrl}/contracts/${i.contractId}`),
      "",
      advice.replace(/<[^>]+>/g, "").replace(/&rarr;/g, "→"),
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
    after: linkFallback(i.actionUrl) + small(`This link works once and expires after a while for security. If it has expired, ask ${who} to resend the invite from the Team page.`),
    footer: `${who} invited you to ${esc(i.workspace)}. Reply to this email to reach them. If you weren't expecting this, you can ignore it.`,
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
      `This link works once and expires after a while. If it has expired, ask ${i.inviter ?? "your admin"} to resend the invite.`,
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

// ---------- contracts emailed to the workspace inbox ----------

export interface InboundAdded {
  vendor: string;
  agreement: string | null;
  file: string;
  noticeDeadline: string | null;
  termEnd: string | null;
  annualFee: number | null;
  currency: string | null;
  url: string;
  demo?: boolean;
}

export interface InboundSkipped {
  file: string;
  reason: string;
}

export interface InboundReceiptInput {
  workspace: string;
  address: string;
  subject: string | null;
  added: InboundAdded[];
  skipped: InboundSkipped[];
  /** Why nothing was added, when nothing was. */
  problem: "unverified" | "no_files" | "none_read" | null;
}

/** The reply to someone who emailed contracts in: what was added, what was skipped and why. */
export function inboundReceiptEmail(b: EmailBrand, i: InboundReceiptInput): RenderedEmail {
  const n = i.added.length;
  const re = i.subject ? `Re: ${i.subject}` : null;
  const subject =
    re ??
    (n ? `${n === 1 ? i.added[0].vendor : `${n} contracts`} added to ${i.workspace}` : `We couldn't add your contract to ${i.workspace}`);

  const line = (a: InboundAdded) => {
    const bits = [
      a.noticeDeadline ? `notice deadline <strong>${esc(fmtDate(a.noticeDeadline))}</strong>` : a.termEnd ? `term ends ${esc(fmtDate(a.termEnd))}` : "no renewal date found",
      a.annualFee != null ? esc(fmtMoney(a.annualFee, a.currency)) + " a year" : null,
    ].filter(Boolean);
    return `${link(a.url, `<strong>${esc(a.vendor)}</strong>`)}: ${bits.join(" · ")}<br/><span style="color:${C.muted};font-size:13px;">${esc(a.file)}</span>`;
  };
  const skippedHtml = i.skipped.length
    ? p("Not added:", "margin-bottom:8px;") +
      `<ul style="margin:0 0 20px;padding-left:20px;font-family:${FONT};font-size:14px;line-height:22px;color:${C.ink2};">${i.skipped
        .map((s) => `<li>${esc(s.file)}: ${esc(s.reason)}</li>`)
        .join("")}</ul>`
    : "";

  let heading: string;
  let body: string;
  let cta: { label: string; url: string } | undefined;
  if (i.problem === "unverified") {
    heading = "We couldn't confirm this email came from you";
    body =
      p(`Someone sent contracts to the <strong>${esc(i.workspace)}</strong> inbox from your address, but your email provider didn't confirm the message was really sent by you (no DMARC or DKIM pass), so nothing was added.`) +
      callout("If it was you, upload the file on the Upload page instead, or ask your IT team to turn on DKIM for your domain. If it wasn't you, nothing was changed and you can ignore this.", "warn");
    cta = { label: "Upload it instead", url: `${b.appUrl}/upload` };
  } else if (i.problem === "no_files") {
    heading = "No contract attached";
    body =
      p(`We got your email at <strong>${esc(i.address)}</strong>, but it had no PDF or Word (.docx) attachment to read.`) +
      skippedHtml +
      p("Reply with the contract attached, or forward the vendor's email with its attachments.");
  } else if (n === 0) {
    heading = "We couldn't read your contract";
    body = p(`We got your email at <strong>${esc(i.address)}</strong>, but couldn't add anything from it.`) + skippedHtml;
    cta = { label: "Try the Upload page", url: `${b.appUrl}/upload` };
  } else {
    heading = n === 1 ? `${i.added[0].vendor} is now on your radar` : `${n} contracts are now on your radar`;
    body =
      p(`Claude read what you sent to <strong>${esc(i.workspace)}</strong> and added ${n === 1 ? "it" : "them"}. Check the dates against the contract, then confirm the tool on the Tools page.`) +
      bullets(i.added.map(line)) +
      (i.added.some((a) => a.demo) ? callout("These are sample results: the app has no Claude API key yet.", "warn") : "") +
      skippedHtml;
    cta = { label: n === 1 ? `Open ${i.added[0].vendor}` : "Open contracts", url: n === 1 ? i.added[0].url : `${b.appUrl}/contracts` };
  }

  const html = renderEmail(b, {
    preheader: n ? `${n} added${i.skipped.length ? `, ${i.skipped.length} skipped` : ""}.` : heading,
    eyebrow: "Contract inbox",
    heading,
    body,
    cta,
    footer: `You emailed ${esc(i.address)}, the contract inbox for ${esc(i.workspace)}. Forward any SaaS contract there to add it.`,
  });
  const text = renderText(
    b,
    [
      heading,
      "",
      ...i.added.map((a) => `• ${a.vendor}: ${a.noticeDeadline ? `notice deadline ${fmtDate(a.noticeDeadline)}` : a.termEnd ? `term ends ${fmtDate(a.termEnd)}` : "no renewal date found"} (${a.url})`),
      ...(i.skipped.length ? ["", "Not added:", ...i.skipped.map((s) => `• ${s.file}: ${s.reason}`)] : []),
      i.problem === "unverified" ? "Your email provider didn't confirm the message came from you, so nothing was added. Upload the file instead." : null,
      i.problem === "no_files" ? "There was no PDF or Word (.docx) attachment to read." : null,
      cta ? `${cta.label}: ${cta.url}` : null,
    ],
    `You emailed ${i.address}, the contract inbox for ${i.workspace}.`,
  );
  return { subject, html, text };
}
