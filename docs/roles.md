# Roles

Every workspace member has one role. The database stores it in `workspace_members.role` (and `workspace_invites.role` for pending invites).

| Role | Stored as | Can do |
| --- | --- | --- |
| Admin | `owner` | Everything: team, departments, billing, sources, settings, approvals. |
| Approver | `approver` | Sees everything, including the leadership view. Approves renewal decisions. Gets every renewal reminder. Can upload and edit contracts, and invite department owners and viewers. |
| Department owner | `member` | Looks after their own department's tools, answers their surveys, uploads contracts. Gets reminders for their department. |
| Viewer | `viewer` | Read only. Sees the workspace but can't upload, edit, invite or answer surveys. Gets no reminders. |

Only admins can invite or promote admins and approvers. Re-inviting an existing member can raise their role but never lowers it; to lower a role, change it on the Team page.

## Where the rules live

- Database: `supabase/migrations/20261116215000_roles.sql` adds `workspace_role(ws)`, `can_write(ws)` (false for viewers) and `can_approve_renewals(ws)` (admins and approvers), plus restrictive RLS policies so viewers can't write to contracts, tools, surveys, invites, the workspace or contract files.
- App: `src/lib/roles.ts` has the same rules for the UI and API routes (`canWrite`, `canApproveRenewals`, `canInviteRole`). `denyViewer()` in `src/lib/server/api.ts` returns a 403 for viewers.

## Setup

Run `supabase/migrations/20261116215000_roles.sql` once in the Supabase SQL editor. Until it runs, the Team page can't save the new roles (the old check constraint only allows admin and department owner), and everything else keeps working.
