import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { isRole, parseRole, roleLabel } from "@/lib/roles";
import { appOrigin, getBillingRowAdmin, getStripe, syncSubscription } from "@/lib/server/billing";
import { sendInviteEmail } from "@/lib/server/invite-email";
import { logPlatformAction, requirePlatformAdmin, type PlatformCtx } from "@/lib/server/platform";

// Every change the platform admin console makes. Platform admins only (everyone else gets a 404),
// done with the service role key on the server, and written to the platform audit log.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown> & { action?: string };
type Result = { ok: true; message?: string } | { ok: false; error: string; status?: number };

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const DAY = 86_400_000;

export async function POST(req: Request) {
  const ctx = await requirePlatformAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => ({}))) as Body;
  let result: Result;
  try {
    result = await run(ctx, body, appOrigin(req));
  } catch (e) {
    result = { ok: false, error: (e as Error).message || "Something went wrong." };
  }
  if (!result.ok) return NextResponse.json(result, { status: result.status ?? 400 });
  return NextResponse.json(result);
}

async function userEmail(ctx: PlatformCtx, id: string): Promise<string | null> {
  const { data } = await ctx.db.auth.admin.getUserById(id);
  return data.user?.email ?? null;
}

async function workspaceName(ctx: PlatformCtx, id: string): Promise<string | null> {
  const { data } = await ctx.db.from("workspaces").select("name").eq("id", id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/** Refuses a change that would leave a workspace with members but no admin. */
async function wouldOrphan(ctx: PlatformCtx, workspaceId: string, userId: string): Promise<boolean> {
  const { data } = await ctx.db.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId);
  const rows = (data ?? []) as { user_id: string; role: string }[];
  const others = rows.filter((r) => r.user_id !== userId);
  return others.length > 0 && !others.some((r) => r.role === "owner") && rows.some((r) => r.user_id === userId && r.role === "owner");
}

async function run(ctx: PlatformCtx, b: Body, origin: string): Promise<Result> {
  const { db, session } = ctx;
  const userId = str(b.userId, 64);
  const workspaceId = str(b.workspaceId, 64);

  switch (b.action) {
    // ----- Users -----
    case "user.disable":
    case "user.enable": {
      if (!userId) return { ok: false, error: "Missing user." };
      if (userId === session.userId) return { ok: false, error: "You can't disable your own account." };
      const disable = b.action === "user.disable";
      const { data, error } = await db.auth.admin.updateUserById(userId, { ban_duration: disable ? "876000h" : "none" });
      if (error) return { ok: false, error: error.message };
      await logPlatformAction(ctx, { action: b.action, targetType: "user", targetId: userId, targetLabel: data.user?.email ?? undefined });
      return { ok: true, message: disable ? "Account disabled. They can't sign in until you enable it again." : "Account enabled." };
    }
    case "user.reset_password": {
      const email = await userEmail(ctx, userId);
      if (!email) return { ok: false, error: "User not found." };
      // Same flow as "Forgot password": Supabase sends its (branded) reset email through Resend.
      const anon = createSupabase(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/login/reset")}` });
      if (error) return { ok: false, error: /rate limit/i.test(error.message) ? "Too many emails were sent to this address recently. Try again in a few minutes." : error.message };
      await logPlatformAction(ctx, { action: "user.password_reset_sent", targetType: "user", targetId: userId, targetLabel: email });
      return { ok: true, message: `Password reset email sent to ${email}.` };
    }
    case "user.resend_invite": {
      const email = await userEmail(ctx, userId);
      if (!email) return { ok: false, error: "User not found." };
      const { data: m } = await db.from("workspace_members").select("workspace_id, role, workspaces(name)").eq("user_id", userId).limit(1).maybeSingle();
      const wsName = (m as { workspaces?: { name?: string } | null } | null)?.workspaces?.name;
      const sent = await sendInviteEmail(email, origin, wsName ? { workspace: wsName, inviter: null, department: null, role: parseRole(m?.role) } : undefined);
      if (!sent.emailed) return { ok: false, error: sent.note ?? "The email didn't send." };
      await logPlatformAction(ctx, { action: "user.invite_resent", targetType: "user", targetId: userId, targetLabel: email });
      return { ok: true, message: `A fresh sign-in link was sent to ${email}.` };
    }
    case "user.delete": {
      const email = await userEmail(ctx, userId);
      if (!email) return { ok: false, error: "User not found." };
      if (userId === session.userId) return { ok: false, error: "You can't delete your own account here." };
      if (str(b.confirm).toLowerCase() !== email.toLowerCase()) return { ok: false, error: "Type their email address exactly to confirm." };
      const { data: owned } = await db.from("workspace_members").select("workspace_id").eq("user_id", userId).eq("role", "owner");
      for (const o of (owned ?? []) as { workspace_id: string }[]) {
        if (await wouldOrphan(ctx, o.workspace_id, userId)) {
          return { ok: false, error: `${email} is the only admin of "${await workspaceName(ctx, o.workspace_id)}". Make someone else its admin first.` };
        }
      }
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) return { ok: false, error: error.message };
      await logPlatformAction(ctx, { action: "user.deleted", targetType: "user", targetId: userId, targetLabel: email });
      return { ok: true, message: `${email} was deleted.` };
    }
    case "platform_admin.add":
    case "platform_admin.remove": {
      const email = await userEmail(ctx, userId);
      if (!email) return { ok: false, error: "User not found." };
      if (b.action === "platform_admin.remove") {
        if (userId === session.userId) return { ok: false, error: "You can't remove your own platform admin access." };
        const { error } = await db.from("platform_admins").delete().eq("user_id", userId);
        if (error) return { ok: false, error: error.message };
      } else {
        const { error } = await db.from("platform_admins").upsert({ user_id: userId, email, added_by_email: session.email }, { onConflict: "user_id" });
        if (error) return { ok: false, error: /platform_admins/.test(error.message) ? "Run platform-admin.sql in Supabase first." : error.message };
      }
      await logPlatformAction(ctx, { action: b.action, targetType: "platform_admin", targetId: userId, targetLabel: email });
      return { ok: true, message: b.action === "platform_admin.add" ? `${email} can now open the admin console.` : `${email} no longer has platform admin access.` };
    }

    // ----- Members and invites -----
    case "member.role": {
      if (!workspaceId || !userId || !isRole(b.role)) return { ok: false, error: "Pick a role." };
      if (b.role !== "owner" && (await wouldOrphan(ctx, workspaceId, userId))) return { ok: false, error: "That would leave the workspace without an admin." };
      const { data, error } = await db.from("workspace_members").update({ role: b.role }).eq("workspace_id", workspaceId).eq("user_id", userId).select("email").maybeSingle();
      if (error) return { ok: false, error: error.message };
      await logPlatformAction(ctx, { action: "member.role_changed", targetType: "member", targetId: userId, targetLabel: data?.email, workspaceId, details: { role: b.role } });
      return { ok: true, message: `Role changed to ${roleLabel(b.role)}.` };
    }
    case "member.remove": {
      if (!workspaceId || !userId) return { ok: false, error: "Missing member." };
      if (await wouldOrphan(ctx, workspaceId, userId)) return { ok: false, error: "That would leave the workspace without an admin." };
      const { data, error } = await db.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId).select("email").maybeSingle();
      if (error) return { ok: false, error: error.message };
      await logPlatformAction(ctx, { action: "member.removed", targetType: "member", targetId: userId, targetLabel: data?.email, workspaceId });
      return { ok: true, message: "Removed from the workspace. Their account still exists." };
    }
    case "invite.resend": {
      const { data: inv } = await db.from("workspace_invites").select("email, role, workspace_id, workspaces(name)").eq("id", str(b.inviteId, 64)).maybeSingle();
      if (!inv) return { ok: false, error: "That invite was cancelled or already accepted." };
      const wsName = (inv as { workspaces?: { name?: string } | null }).workspaces?.name ?? "Contract Radar";
      const sent = await sendInviteEmail(inv.email, origin, { workspace: wsName, inviter: null, department: null, role: parseRole(inv.role) });
      if (!sent.emailed) return { ok: false, error: sent.note ?? "The email didn't send." };
      await logPlatformAction(ctx, { action: "invite.resent", targetType: "invite", targetLabel: inv.email, workspaceId: inv.workspace_id });
      return { ok: true, message: `Invite sent again to ${inv.email}.` };
    }
    case "invite.cancel": {
      const { data, error } = await db.from("workspace_invites").delete().eq("id", str(b.inviteId, 64)).select("email, workspace_id").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (data) await logPlatformAction(ctx, { action: "invite.cancelled", targetType: "invite", targetLabel: data.email, workspaceId: data.workspace_id });
      return { ok: true, message: "Invite cancelled." };
    }

    // ----- Workspaces -----
    case "workspace.rename": {
      const name = str(b.name, 80);
      if (!workspaceId || !name) return { ok: false, error: "Enter a name." };
      const before = await workspaceName(ctx, workspaceId);
      const { error } = await db.from("workspaces").update({ name }).eq("id", workspaceId);
      if (error) return { ok: false, error: error.message };
      await logPlatformAction(ctx, { action: "workspace.renamed", targetType: "workspace", targetId: workspaceId, targetLabel: name, workspaceId, details: { from: before, to: name } });
      return { ok: true, message: "Workspace renamed." };
    }
    case "workspace.alerts": {
      const on = b.on === true;
      const { error } = await db.from("workspaces").update({ renewal_alerts: on }).eq("id", workspaceId);
      if (error) return { ok: false, error: error.message };
      await logPlatformAction(ctx, { action: on ? "workspace.alerts_on" : "workspace.alerts_off", targetType: "workspace", targetId: workspaceId, targetLabel: (await workspaceName(ctx, workspaceId)) ?? undefined, workspaceId });
      return { ok: true, message: on ? "Renewal reminders switched on." : "Renewal reminders switched off." };
    }

    // ----- Billing -----
    case "billing.comp": {
      if (!workspaceId) return { ok: false, error: "Missing workspace." };
      const on = b.on === true;
      const row = await getBillingRowAdmin(workspaceId);
      if (!row) return { ok: false, error: "No billing row (has billing.sql been run?)." };
      const { error } = await db.from("workspace_billing").update({ complimentary: on, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
      if (error) return { ok: false, error: error.message };
      await logPlatformAction(ctx, { action: on ? "billing.comped" : "billing.uncomped", targetType: "billing", targetId: workspaceId, targetLabel: (await workspaceName(ctx, workspaceId)) ?? undefined, workspaceId });
      return {
        ok: true,
        message: on
          ? `Free forever: full Business access, no card needed.${row.stripe_subscription_id ? " It still has a Stripe subscription, so cancel that too if they shouldn't be charged." : ""}`
          : "Complimentary access removed. Their trial or subscription applies again.",
      };
    }
    case "billing.trial": {
      const days = Math.round(Number(b.days));
      if (!workspaceId || !Number.isFinite(days) || days < 1 || days > 365) return { ok: false, error: "Enter 1 to 365 days." };
      const row = await getBillingRowAdmin(workspaceId);
      if (!row) return { ok: false, error: "No billing row (has billing.sql been run?)." };
      const from = Math.max(Date.now(), Date.parse(row.trial_ends_at));
      const until = new Date(from + days * DAY);
      const { error } = await db.from("workspace_billing").update({ trial_ends_at: until.toISOString(), updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
      if (error) return { ok: false, error: error.message };
      // A Stripe subscription that is still in its trial gets the same end date, so the first charge moves too.
      let stripeNote = "";
      const stripe = getStripe();
      if (stripe && row.stripe_subscription_id && row.status === "trialing") {
        await stripe.subscriptions.update(row.stripe_subscription_id, { trial_end: Math.floor(until.getTime() / 1000), proration_behavior: "none" });
        await syncSubscription(row.stripe_subscription_id);
        stripeNote = " The Stripe trial moved too.";
      }
      await logPlatformAction(ctx, { action: "billing.trial_extended", targetType: "billing", targetId: workspaceId, targetLabel: (await workspaceName(ctx, workspaceId)) ?? undefined, workspaceId, details: { days, until: until.toISOString() } });
      return { ok: true, message: `Trial now ends ${until.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.${stripeNote}` };
    }
    case "billing.cancel":
    case "billing.resume":
    case "billing.sync": {
      const row = workspaceId ? await getBillingRowAdmin(workspaceId) : null;
      if (!row?.stripe_subscription_id) return { ok: false, error: "This workspace has no Stripe subscription." };
      const stripe = getStripe();
      if (!stripe) return { ok: false, error: "STRIPE_SECRET_KEY isn't set." };
      const sub = row.stripe_subscription_id;
      let message = "Synced from Stripe.";
      if (b.action === "billing.cancel") {
        const now = b.when === "now";
        if (now) await stripe.subscriptions.cancel(sub);
        else await stripe.subscriptions.update(sub, { cancel_at_period_end: true });
        message = now ? "Subscription cancelled now. No further charges." : "Subscription will end at the end of the current period.";
      } else if (b.action === "billing.resume") {
        await stripe.subscriptions.update(sub, { cancel_at_period_end: false });
        message = "Cancellation undone. The subscription renews as normal.";
      }
      await syncSubscription(sub);
      if (b.action !== "billing.sync") {
        await logPlatformAction(ctx, {
          action: b.action === "billing.resume" ? "billing.resumed" : b.when === "now" ? "billing.cancelled_now" : "billing.cancel_at_period_end",
          targetType: "billing",
          targetId: workspaceId,
          targetLabel: (await workspaceName(ctx, workspaceId)) ?? undefined,
          workspaceId,
          details: { subscription: sub },
        });
      }
      return { ok: true, message };
    }

    // ----- Support -----
    case "support.resolve":
    case "support.reopen": {
      const id = str(b.id, 64);
      const resolve = b.action === "support.resolve";
      const patch = resolve
        ? { status: "resolved", resolved_at: new Date().toISOString(), resolved_by_email: session.email, note: str(b.note, 2000) || null }
        : { status: "open", resolved_at: null, resolved_by_email: null };
      const { data, error } = await db.from("support_requests").update(patch).eq("id", id).select("email, workspace_id").maybeSingle();
      if (error) return { ok: false, error: error.message };
      await logPlatformAction(ctx, { action: resolve ? "support.resolved" : "support.reopened", targetType: "support", targetId: id, targetLabel: data?.email });
      return { ok: true, message: resolve ? "Marked as resolved." : "Reopened." };
    }
  }
  return { ok: false, error: "Unknown action." };
}
