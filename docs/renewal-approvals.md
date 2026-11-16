# Renewal approvals

Before each renewal, the department owner recommends what to do and an approver signs it off. Every step is logged.

## Flow

1. **Recommend.** On the contract page, the *Renewal decision* card offers Keep, Cut seats, Consolidate, Renegotiate or Cancel. It is pre-filled from what Contract Radar already found (unused seats, price hikes over the cap, missing caps, duplicate tools), with expected savings and a reason the owner can edit.
2. **Approve or send back.** Admins and Finance approvers (`owner` / `approver` roles) approve, or send it back with a required note. Sending back lets the owner revise and resubmit. An approver can reopen a decided renewal (for example when the vendor comes back with a new offer).
3. **Act.** Once approved, "Draft the email to the vendor" jumps to the pushback email with the matching goal (cut seats with the approved seat count, push back on the increase, ask for a cap, cancel).

Who can recommend: admins, approvers, and department owners for tools in their own department (anyone when the contract isn't linked to a department). Viewers can read only.

## Where it shows up

- **Contract page:** the Renewal decision card, with history.
- **Renewal approvals** (`/approvals`, in the menu): everything with a notice deadline or term end in the next 120 days, grouped by Waiting for approval, Needs a recommendation, Sent back, Approved, plus approved savings. The menu badge counts what needs *you*.
- **Dashboard:** a Renewal decisions card.
- **Emails:** approvers get "Approval needed" when a recommendation comes in; the recommender gets "Approved" or "Sent back". The 90/60/30-day renewal reminders now say where each decision stands.

## Data

`supabase/migrations/20261116220000_renewal_approvals.sql` adds `renewal_reviews` (one per contract per term, keyed by the term end date) and `renewal_review_events` (append-only history). Members can read both; all writes go through `submit_renewal_recommendation`, `decide_renewal_review` and `reopen_renewal_review`, which check permissions. When the audit log's `public.log_audit` exists, every step is also written there as `renewal.recommended`, `renewal.revised`, `renewal.approved`, `renewal.rejected` or `renewal.reopened`.

Sample contracts and demo mode keep decisions in the browser so the flow can be shown without an account.
