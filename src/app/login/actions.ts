"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logSignIn } from "@/lib/server/audit";
import { appUrl } from "@/lib/email/brand";
import { passwordProblem } from "@/lib/server/password";
import { allowAll, requestIp, TOO_MANY } from "@/lib/server/rate-limit";
import { safeNextPath } from "@/lib/safe-redirect";

export type AuthState = { error?: string; message?: string; sso?: boolean };

const safeNext = (v: FormDataEntryValue | null) => safeNextPath(v, "/");

export async function authenticate(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const intent = form.get("intent");
  const next = safeNext(form.get("next"));
  if (!email || password.length < 8) return { error: "Enter your email and a password of at least 8 characters." };
  if (email.length > 320 || password.length > 200) return { error: "Wrong email or password." };

  // Slow down password guessing: per account, and per address the requests come from.
  const ip = await requestIp();
  const who = email.toLowerCase();
  const allowed =
    intent === "signup"
      ? await allowAll([[`signup:ip:${ip}`, 10, 3600]])
      : await allowAll([[`login:email:${who}`, 10, 900], [`login:ip:${ip}`, 50, 900]]);
  if (!allowed) return { error: TOO_MANY };

  const supabase = await createClient();
  // Companies that switched on "require SSO" can't use passwords. (Fails open before the migration has run.)
  const { data: ssoOnly } = await supabase.rpc("sso_required", { email });
  if (ssoOnly === true) {
    return { error: "Your company signs in with single sign-on. Use “Sign in with SSO” below.", sso: true };
  }
  if (intent === "signup") {
    const weak = await passwordProblem(password, email);
    if (weak) return { error: weak };
    const origin = await siteOrigin();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) return { error: error.message };
    if (!data.session) return { message: `Check ${email} for a confirmation link, then come back and sign in.` };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message === "Invalid login credentials" ? "Wrong email or password." : error.message };
    // Two-step sign-in turned on: the password alone isn't enough, ask for the authenticator code next.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect(`/login/mfa?next=${encodeURIComponent(next)}`);
    await logSignIn(supabase, "password");
  }
  redirect(next);
}

/** Second step of sign-in: the 6-digit code from the person's authenticator app. */
export async function verifyMfaSignIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const code = String(form.get("code") ?? "").replace(/\s+/g, "");
  const next = safeNext(form.get("next"));
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) redirect("/login");
  if (!(await allowAll([[`mfa-login:user:${uid}`, 8, 900], [`mfa-login:ip:${await requestIp()}`, 40, 900]]))) return { error: TOO_MANY };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = (factors?.totp ?? []).filter((f) => f.status === "verified");
  if (!totp.length) redirect(next);
  for (const f of totp) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
    if (!error) {
      await logSignIn(supabase, "password+totp");
      redirect(next);
    }
  }
  return { error: "That code didn't work. Use the newest code in your authenticator app, and check your phone's clock is set automatically." };
}

/**
 * Where links in auth emails point. APP_URL (or Vercel's production address) wins over the request's own
 * Host/Origin headers, so a forged header can't put someone else's site into a reset or sign-up email.
 */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const fromRequest = h.get("origin") ?? `https://${h.get("host") ?? "localhost:3000"}`;
  // On a laptop (npm run dev) keep links on localhost even when .env.local has the live APP_URL.
  if (process.env.NODE_ENV !== "production") return fromRequest;
  return appUrl(fromRequest);
}

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email || email.length > 320) return { error: "Enter your work email." };
  const ip = await requestIp();
  if (!(await allowAll([[`reset:email:${email.toLowerCase()}`, 5, 3600], [`reset:ip:${ip}`, 20, 3600]]))) {
    return { error: "Too many reset emails were sent recently. Wait a few minutes and try again." };
  }
  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/login/reset")}`,
  });
  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return { error: "Too many reset emails were sent recently. Wait a few minutes and try again." };
    }
    return { error: error.message };
  }
  // Same message whether or not the account exists, so emails can't be probed.
  return { message: `If ${email} has an account, a reset link is on its way. Open it in this browser.` };
}

export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password !== confirm) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const weak = await passwordProblem(password, String(claims?.claims?.email ?? ""));
  if (weak) return { error: weak };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "insufficient_aal" || /AAL2/i.test(error.message)) {
      return { error: "Enter your two-step sign-in code first: reload this page and it will ask for it." };
    }
    if (/session/i.test(error.message)) return { error: "Your reset link has expired. Request a new one from the sign-in page." };
    return { error: error.message };
  }
  // A reset usually means the old password may be known to someone else: end every other session.
  await supabase.auth.signOut({ scope: "others" }).catch(() => null);
  redirect("/");
}

/** First password after an invite or email-link sign-in (the /auth/confirm page). Same rules as everywhere else. */
export async function setFirstPassword(password: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { error: "Your sign-in link has expired. Ask for a new invite." };
  const weak = await passwordProblem(password, String(claims.claims.email ?? ""));
  if (weak) return { error: weak };
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { error: error.message } : {};
}

/** Starts SAML sign-in for the email's domain and sends the browser to the company's identity provider. */
export async function startSso(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(form.get("next"));
  const domain = email.includes("@") ? email.split("@")[1] : email;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { error: "Enter your work email, for example name@company.com." };
  if (!(await allowAll([[`sso:ip:${await requestIp()}`, 30, 900]]))) return { error: TOO_MANY };
  const supabase = await createClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signInWithSSO({
    domain,
    options: { redirectTo: `${origin}/auth/callback?method=sso&next=${encodeURIComponent(next)}` },
  });
  if (error || !data?.url) {
    if (error && /not found|no sso provider|sso_provider_not_found/i.test(`${error.code ?? ""} ${error.message}`)) {
      return { error: `Single sign-on isn't set up for ${domain} yet. Ask your admin, or sign in with your password.` };
    }
    if (error && /disabled|not enabled|sso.*plan/i.test(error.message)) {
      return { error: "Single sign-on isn't switched on for Contract Radar yet. Sign in with your password for now." };
    }
    return { error: error?.message ?? "Could not start single sign-on." };
  }
  redirect(data.url);
}
