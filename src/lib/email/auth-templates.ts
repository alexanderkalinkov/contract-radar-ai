// Supabase Auth email templates (Authentication → Emails in the Supabase dashboard), built from the same
// layout as the app's own emails. Links use Supabase's {{ .SiteURL }}, so nothing here names a domain:
// set Site URL in Supabase (Authentication → URL Configuration) and the logo and links follow it.
// Rebuild the HTML files in supabase/templates with: npm run email:templates
import { C, callout, FONT, linkFallback, p, renderEmail, small, type EmailBrand } from "./layout";

export interface AuthTemplate {
  /** Supabase's name for the template, as shown in the dashboard. */
  label: string;
  file: string;
  subject: string;
  html: string;
}

const code = (token: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr>
  <td style="background:${C.canvas};border:1px solid ${C.line};border-radius:10px;padding:14px 22px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:26px;line-height:30px;font-weight:700;letter-spacing:6px;color:${C.ink};">${token}</td>
</tr></table>`;

export function authTemplates(name = "Contract Radar"): AuthTemplate[] {
  const b: EmailBrand = { name, appUrl: "{{ .SiteURL }}", logoUrl: "{{ .SiteURL }}/email/logo.png" };
  const url = "{{ .ConfirmationURL }}";
  const ignore = "If you didn't ask for this, you can safely ignore this email.";

  return [
    {
      label: "Confirm sign up",
      file: "confirm-signup.html",
      subject: `Confirm your email for ${name}`,
      html: renderEmail(b, {
        preheader: `One click and your ${name} account is ready.`,
        eyebrow: "Welcome",
        heading: "Confirm your email to get started",
        body:
          p(`Thanks for signing up for ${name} with <strong>{{ .Email }}</strong>. Confirm your address and you can upload your first contracts. We'll pull out every renewal date, notice deadline and price-increase cap for you.`),
        cta: { label: "Confirm email", url },
        after: linkFallback(url),
        footer: `Someone created a ${name} account with this address. ${ignore}`,
      }),
    },
    {
      label: "Invite user",
      file: "invite-user.html",
      subject: `You're invited to join your team on ${name}`,
      html: renderEmail(b, {
        preheader: "Your team added you to their workspace. Accept to get started.",
        eyebrow: "You're invited",
        heading: `Join your team on ${name}`,
        body:
          p(`Your team invited <strong>{{ .Email }}</strong> to their ${name} workspace, where they track software contracts, renewal dates and price increases.`) +
          p("Accept the invite to see your department's tools and confirm what you use."),
        cta: { label: "Accept invite", url },
        after: linkFallback(url) + small("This link works once and expires after a while for security. If it has expired, ask your admin to resend the invite."),
        footer: `You were invited to ${name}. If you weren't expecting this, you can ignore this email.`,
      }),
    },
    {
      label: "Magic link",
      file: "magic-link.html",
      subject: `Your ${name} sign-in link`,
      html: renderEmail(b, {
        preheader: "Use this link to sign in. It expires in 1 hour.",
        eyebrow: "Sign in",
        heading: `Sign in to ${name}`,
        body: p(`Click below to sign in as <strong>{{ .Email }}</strong>. If a teammate invited you, this also takes you straight to their workspace.`),
        cta: { label: "Sign in", url },
        after: linkFallback(url) + small("This link works once and expires in 1 hour."),
        footer: `Someone asked to sign in to ${name} with this address. ${ignore}`,
      }),
    },
    {
      label: "Reset password",
      file: "reset-password.html",
      subject: `Reset your ${name} password`,
      html: renderEmail(b, {
        preheader: "Choose a new password. This link expires in 1 hour.",
        eyebrow: "Password reset",
        heading: "Reset your password",
        body: p(`We got a request to reset the password for <strong>{{ .Email }}</strong>. Click below and choose a new one. Open the link in the same browser you asked from.`),
        cta: { label: "Choose a new password", url },
        after: linkFallback(url) + small("This link works once and expires in 1 hour."),
        footer: `${ignore} Your password stays the same until you choose a new one.`,
      }),
    },
    {
      label: "Change email address",
      file: "change-email.html",
      subject: `Confirm your new ${name} email`,
      html: renderEmail(b, {
        preheader: "Confirm the change to your sign-in email.",
        eyebrow: "Account",
        heading: "Confirm your new email",
        body: p(`You asked to change your ${name} sign-in email from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>. Confirm to finish the change.`),
        cta: { label: "Confirm new email", url },
        after: linkFallback(url),
        footer: `${ignore} Your email stays the same.`,
      }),
    },
    {
      label: "Reauthentication",
      file: "reauthentication.html",
      subject: `Your ${name} verification code`,
      html: renderEmail(b, {
        preheader: "Your one-time verification code.",
        eyebrow: "Verify it's you",
        heading: "Your verification code",
        body: p("Enter this code to confirm it's you:") + code("{{ .Token }}") + callout(`<span style="font-family:${FONT};">Never share this code. ${name} will never ask you for it.</span>`, "info"),
        footer: `${ignore} Someone may have typed your email by mistake.`,
      }),
    },
  ];
}
