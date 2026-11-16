"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logSignIn } from "@/lib/server/audit";

export type AuthState = { error?: string; message?: string; sso?: boolean };

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function authenticate(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const intent = form.get("intent");
  const next = safeNext(form.get("next"));
  if (!email || password.length < 8) return { error: "Enter your email and a password of at least 8 characters." };

  const supabase = await createClient();
  // Companies that switched on "require SSO" can't use passwords. (Fails open before the migration has run.)
  const { data: ssoOnly } = await supabase.rpc("sso_required", { email });
  if (ssoOnly === true) {
    return { error: "Your company signs in with single sign-on. Use “Sign in with SSO” below.", sso: true };
  }
  if (intent === "signup") {
    const origin = (await headers()).get("origin") ?? "http://localhost:3000";
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
    await logSignIn(supabase, "password");
  }
  redirect(next);
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host") ?? "localhost:3000"}`;
}

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Enter your work email." };
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
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/session/i.test(error.message)) return { error: "Your reset link has expired. Request a new one from the sign-in page." };
    return { error: error.message };
  }
  redirect("/");
}

/** Starts SAML sign-in for the email's domain and sends the browser to the company's identity provider. */
export async function startSso(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(form.get("next"));
  const domain = email.includes("@") ? email.split("@")[1] : email;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { error: "Enter your work email, for example name@company.com." };
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
