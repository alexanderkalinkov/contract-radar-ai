// One branded layout for every email the app sends (and for the Supabase auth templates).
// Plain table markup with inline styles, because that's what Gmail, Outlook and Apple Mail all render the same.
// Pure functions only, so scripts/build-email-templates.mts can import this file too.

export interface EmailBrand {
  name: string;
  appUrl: string;
  logoUrl: string;
}

export interface EmailParts {
  /** Grey preview text shown after the subject in the inbox. */
  preheader: string;
  eyebrow?: string;
  heading: string;
  /** HTML blocks built with the helpers below. */
  body: string;
  cta?: { label: string; url: string };
  /** HTML shown under the button, e.g. a fallback link. */
  after?: string;
  /** Why they got this email. HTML. */
  footer: string;
}

export const C = {
  navy: "#0B1B33",
  navyText: "#C9D3E3",
  brand: "#1D4ED8",
  brandSoft: "#EEF2FF",
  brandLine: "#C7D2FE",
  ink: "#101828",
  ink2: "#344054",
  muted: "#4B5565",
  faint: "#667085",
  line: "#E3E6EB",
  lineSoft: "#EEF0F3",
  canvas: "#F5F6F8",
  urgent: "#C4320A",
  urgentSoft: "#FEF3F2",
  warn: "#B54708",
  warnSoft: "#FEF0E6",
  good: "#067647",
  goodSoft: "#ECFDF3",
};

export const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** For href values. Leaves Supabase template tags like {{ .ConfirmationURL }} intact. */
export const attr = (url: string) => url.replace(/&(?!amp;)/g, "&amp;").replace(/"/g, "%22");

export const p = (html: string, style = "") =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.ink2};${style}">${html}</p>`;

export const small = (html: string) =>
  `<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">${html}</p>`;

export const link = (url: string, label: string) =>
  `<a href="${attr(url)}" style="color:${C.brand};text-decoration:underline;">${label}</a>`;

export function button(url: string, label: string): string {
  // "Bulletproof" button: a padded table cell works in Outlook as well as everywhere else.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td align="center" bgcolor="${C.brand}" style="border-radius:10px;background:${C.brand};">
    <a href="${attr(url)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(label)}</a>
  </td></tr>
</table>`;
}

export function callout(html: string, tone: "info" | "warn" | "urgent" | "good" = "info"): string {
  const t = {
    info: [C.brandSoft, C.brandLine, C.ink2],
    warn: [C.warnSoft, "#F9C9A3", "#93370D"],
    urgent: [C.urgentSoft, "#FECDCA", "#912018"],
    good: [C.goodSoft, "#ABEFC6", "#05603A"],
  }[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
  <tr><td style="background:${t[0]};border:1px solid ${t[1]};border-radius:10px;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:21px;color:${t[2]};">${html}</td></tr>
</table>`;
}

export function bullets(items: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
${items
  .map(
    (i) => `  <tr>
    <td valign="top" style="padding:0 10px 8px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.brand};">&#10003;</td>
    <td valign="top" style="padding:0 0 8px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.ink2};">${i}</td>
  </tr>`,
  )
  .join("\n")}
</table>`;
}

/** The fallback "button doesn't work?" line. */
export const linkFallback = (url: string) =>
  small(
    `Button not working? Copy this link into your browser:<br><a href="${attr(url)}" style="color:${C.brand};word-break:break-all;">${url}</a>`,
  );

export function renderEmail(b: EmailBrand, e: EmailParts): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(e.heading)}</title>
<style>
  @media (max-width: 620px) {
    .cr-card { padding: 28px 22px !important; }
    .cr-h1 { font-size: 22px !important; line-height: 30px !important; }
  }
  a { color: ${C.brand}; }
</style>
</head>
<body style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(e.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
      <tr><td style="background:${C.navy};border-radius:14px 14px 0 0;padding:18px 28px;">
        <a href="${attr(b.appUrl)}" target="_blank" style="text-decoration:none;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" style="padding-right:10px;"><img src="${attr(b.logoUrl)}" width="28" height="28" alt="" style="display:block;border:0;width:28px;height:28px;"></td>
            <td valign="middle" style="font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.2px;color:#FFFFFF;">${esc(b.name)}</td>
          </tr></table>
        </a>
      </td></tr>
      <tr><td class="cr-card" style="background:#FFFFFF;border:1px solid ${C.line};border-top:0;border-radius:0 0 14px 14px;padding:36px 40px 28px;">
        ${e.eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${C.brand};">${esc(e.eyebrow)}</p>` : ""}
        <h1 class="cr-h1" style="margin:0 0 18px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.3px;color:${C.ink};">${esc(e.heading)}</h1>
        ${e.body}
        ${e.cta ? button(e.cta.url, e.cta.label) : ""}
        ${e.after ?? ""}
      </td></tr>
      <tr><td style="padding:22px 28px 8px;font-family:${FONT};font-size:12px;line-height:19px;color:${C.faint};text-align:center;">
        ${e.footer}
      </td></tr>
      <tr><td style="padding:0 28px 8px;font-family:${FONT};font-size:12px;line-height:19px;color:${C.faint};text-align:center;">
        <a href="${attr(b.appUrl)}" target="_blank" style="color:${C.faint};text-decoration:underline;">${esc(b.name)}</a> &middot; Never miss a renewal or a price hike again.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Plain-text twin of an email, for clients that don't show HTML (and better spam scores). */
export function renderText(b: EmailBrand, lines: (string | null | undefined | false)[], reason: string): string {
  return [...lines.filter(Boolean), "", "—", reason, `${b.name} · ${b.appUrl}`].join("\n");
}
