# Platform admin console

`/admin` is for the people who run Contract Radar itself. It is separate from a workspace's own **Admin** role:
a platform admin sees and manages **every** workspace. Anyone else who opens `/admin` gets a plain 404.

## Who gets in

Either of these:

- a row in `public.platform_admins` (add more people from **Users → person → Make platform admin**), or
- their email in `PLATFORM_ADMIN_EMAILS` in Vercel (comma separated). Useful as a way in before the SQL is run.

Platform admins see a **Platform admin** link in the sidebar, under My account.

## Setup

1. Run `supabase/migrations/20261117120000_platform_admin.sql` in the Supabase SQL editor
   (the copy in project files also adds the first admin).
2. `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel (it already is for reminders and invites).

## What's in it

| Tab | What you can do |
|---|---|
| Overview | Users, workspaces, paying, trials, contracts, open support; a "needs attention" list (missing settings, SQL not run, failed payments, trials ending, failed jobs, failed imports) |
| Users | Search and filter everyone; status (active, not confirmed, invited, disabled), last sign-in, workspaces and roles. Per user: send password reset, resend sign-in link, disable/enable, change role per workspace, remove from a workspace, make/remove platform admin, delete (type the email to confirm; refused if they're a workspace's only admin) |
| Workspaces | Members, invites, contracts, plan. Per workspace: rename, reminders on/off, change roles, remove people, resend/cancel invites, recent activity |
| Subscriptions | Every workspace's billing state, rough MRR at list price, links to Stripe. Per workspace: make free forever (complimentary), extend trial by N days (moves the Stripe trial too if there is one), cancel at period end, cancel now, undo cancellation, sync from Stripe |
| Support | Every Help & support message (kept in `support_requests` as well as emailed), reply by email, mark resolved with an internal note, reopen |
| Audit log | Every workspace's audit log in one place, filter by workspace, action or person; plus the platform admin action log |
| Setup & health | Which environment variables are set (never their values), which SQL files have been run, last run of the reminder and import jobs, recent import and email-in failures |

## Safety

- All reads and writes happen on the server with the service role key; the browser only calls `POST /api/admin`,
  which checks platform admin access again on every request.
- Every change is written to `platform_audit_log`, and changes to a workspace also appear in that workspace's own
  audit log as `platform.<action>`, so its admins can see support touched it.
- You can't disable, delete or remove platform admin access from your own account, and role changes or removals that
  would leave a workspace without an admin are refused.
- Plan changes, refunds and card updates stay in Stripe (each workspace links to its Stripe customer).
