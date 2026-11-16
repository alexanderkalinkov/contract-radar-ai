# Demo workspace for sales calls

A separate workspace filled with a realistic, fictional company, **Northwind Logistics (demo)**, to show on calls
instead of real customer data. It lives next to your own workspace and never touches it.

What's in it: 6 departments with their owners (pending invites at `@northwind.example`, an address that can never
receive mail), 11 contracts with notice periods, price caps and seat-reduction clauses, 15 tools with survey answers,
four connected sources (QuickBooks, Xero, Google Workspace, Microsoft) with discovered tools and seat usage from sign-ins (see `docs/seat-usage.md`), and renewals spread over
the next six months. Every date is set relative to the day you create or reset it, so deadlines always look current.

## Set up (once)

1. Supabase → SQL editor → paste the whole of `supabase/migrations/20261116190000_demo_workspace.sql` → Run.
   It adds an `is_demo` flag to workspaces that only the server can set.
2. The server needs `SUPABASE_SERVICE_ROLE_KEY` (already in Vercel for the reminder emails; add it to `.env.local` to use
   the demo locally).

## Use it

- **Workspace settings → Demo workspace for sales calls → Create demo workspace.** It's created, filled and opened.
- Switch between your workspace and the demo with the workspace menu at the bottom of the sidebar.
- **Reset demo data** (in Workspace settings, while in the demo) deletes everything in it, including anything you
  uploaded or invited during a call, and fills it again.

## Guard rails

- Reminder emails are off in the demo, so nobody gets alerts about fictional contracts.
- "Connect" and "Sync now" on the demo's sources don't call QuickBooks, Xero, Google or Microsoft.
- Only a workspace flagged `is_demo` can be reset, and only the server can set that flag, so a real workspace can never
  be wiped by the reset button.
- Signing in on a new device opens your own workspace, not the demo.

The data lives in `src/lib/demo/northwind.ts`; the create and reset logic in `src/lib/server/demo.ts`.
