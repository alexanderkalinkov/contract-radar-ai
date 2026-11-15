"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

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
  }
  redirect(next);
}
