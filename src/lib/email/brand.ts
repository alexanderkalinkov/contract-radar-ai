// Everything an email needs to know about the brand and where the app lives.
// Nothing here is hard-coded to a domain: set these in .env.local / Vercel when the real domain is live.
//
//   EMAIL_FROM        "Outflow <alerts@yourdomain.com>"  (a sender verified in Resend)
//   EMAIL_REPLY_TO    optional, e.g. "support@yourdomain.com"
//   EMAIL_BRAND_NAME  optional, defaults to "Outflow"
//   APP_URL           https://app.yourdomain.com (links in emails point here)

export interface Brand {
  name: string;
  appUrl: string; // no trailing slash
  logoUrl: string;
  from: string;
  replyTo?: string;
}

function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

export function appUrl(fallbackOrigin?: string): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return trimSlash(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${trimSlash(vercel)}`;
  return trimSlash(fallbackOrigin || "http://localhost:3000");
}

export function brand(fallbackOrigin?: string): Brand {
  const name = process.env.EMAIL_BRAND_NAME?.trim() || "Outflow";
  const url = appUrl(fallbackOrigin);
  return {
    name,
    appUrl: url,
    logoUrl: `${url}/email/logo.png`,
    from: process.env.EMAIL_FROM?.trim() || `${name} <onboarding@resend.dev>`,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined,
  };
}

/** Days before a date that reminders go out. Override with RENEWAL_ALERT_DAYS="90,60,30,7". */
export function alertDays(): number[] {
  const raw = process.env.RENEWAL_ALERT_DAYS?.trim();
  const list = (raw ? raw.split(",") : ["90", "60", "30"])
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 365);
  return [...new Set(list.length ? list : [90, 60, 30])].sort((a, b) => b - a);
}
