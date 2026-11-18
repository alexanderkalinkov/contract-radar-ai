# Team onboarding spec

How a new company gets from "the CFO signed up" to "leadership has a keep / cut / consolidate list for every tool".
Status as of 2026-11-15: steps 1 to 4 are built (see "What's in the app"). Accounting and SSO connectors are shown as *coming soon*.

## Who's involved

| Role | Who | What they do |
| --- | --- | --- |
| **Admin (C-level)** | CFO, COO or CEO who buys Outflow. Can be several. | Sets up the workspace, adds departments, invites owners, sees the leadership view. |
| **Department owner** | One head per department (Sales, Marketing, Engineering…) | Confirms which tools are theirs, uploads contracts, answers 4 questions per tool. |

In the database an admin is `workspace_members.role = 'owner'`; a department owner is `role = 'member'` with a `department_id`.

## The flow

### 1. Admin setup (about 10 minutes): `/setup`

1. **Company**: workspace name, company size, the admin's own role (budget owner).
2. **Connect** accounting (QuickBooks, Xero) and sign-in (Google Workspace, Microsoft 365). *Coming soon.* Once live, Outflow drafts the list of every tool the company pays for, with spend and active users, and pre-assigns each to a department by who uses it. Today this step explains that and moves on.
3. **Departments**: pick from presets or add your own.
4. **Invite owners**: one email per department, plus optional extra admins.
5. **Add tools**: a quick-add row (name, department, cost, seats) and a link to upload contracts.
6. **Done**: explains what happens next and opens the leadership view.

Admins who haven't finished setup see a "Bring in your department heads" banner on the Savings page.

### 2. Invite department owners

- The invite is stored in `workspace_invites` with its role and department.
- An email goes out with a link to `/auth/confirm`:
  - with `SUPABASE_SERVICE_ROLE_KEY` set on the server: Supabase's *invite* email;
  - without it: a Supabase sign-in (magic) link that creates the account.
- The link signs them in, offers to set a password, and `bootstrap_workspace()` puts them in the workspace and department.
- Fallback: "Copy sign-up link" on the Team page. They create an account with the invited email and land in the right place.
- Department owners can invite colleagues into their own department; only admins can invite admins.

### 3. Owners fill the gaps (a few minutes per tool): `/tools`

- Every uploaded contract becomes a *suggested* tool (filed under the uploader's department) until someone confirms it.
- Owners see "N of M tools need your answers" and go tool by tool. Saving one answer jumps to the next.
- **The survey (4 questions)**
  1. What does your team use it for? *(free text)*
  2. How critical is it? *(1 = nice to have, 5 = we'd stop working)*
  3. If it disappeared tomorrow, what would you use instead? *(free text, or "we wouldn't need a replacement")*
  4. Do you need all N seats? *(yes / fewer, and how many / not sure)*
- Every answer is kept (`tool_surveys`); the latest one counts. Tools renewing within 45 days with no answer in the last 6 months are flagged "re-check before renewal".

### 4. Leadership view: `/insights` (admins)

- **KPIs**: annual spend tracked, estimated savings, survey completion, overlapping tool groups.
- **Overlaps**: same category, two or more departments. "3 teams pay for 3 different project tools; Asana is the most used." The standard is the tool used by the most departments, then most seats, then highest criticality. If a team named a fallback that's in the group, we suggest that instead.
- **Low value**: over $5K a year and rated 1 or 2 by its own team.
- **By department**: spend, tools, answers, savings.
- **A recommendation for every tool** (logic in `src/lib/team/insights.ts`):

| Recommendation | When | Estimated saving |
| --- | --- | --- |
| Waiting for survey | No answers yet | — |
| Cancel | Rated 1–2 and "we wouldn't need a replacement" | Full cost |
| Consolidate | Overlaps with a more-used tool (not rated 4–5 unless they named the fallback), or rated 1–2 and the fallback is a tool you already pay for | Cost minus seats moved at the standard's per-seat price; 15% for the same product on two contracts |
| Cut seats | Team needs fewer seats than paid for | Per-seat price × unused seats |
| Renegotiate | Rated 1–2 but costs over $5K (25%), or a must-keep over $10K renewing within 120 days (8%) | As shown |
| Keep | Everything else | — |

## Two principles

- **Quick win on day 1.** Uploaded contracts already produce savings on the Savings page before owners do any work, so the buyer sees value immediately.
- **Answers stay current.** Re-ask a month before each renewal. Today that's a flag in the leadership view; automated reminder emails come with custom SMTP (see below).

## What's in the app

- Pages: `/setup`, `/team`, `/tools`, `/tools/[id]`, `/insights`, `/auth/confirm`.
- API: `GET /api/team` (everything, plus syncing uploads into tools) and `POST /api/team` with an `op`.
- Database: `supabase/migrations/20261115120000_team_onboarding.sql` (departments, `tools`, `tool_surveys`, role and department on members and invites). RLS: everyone in a workspace reads; admins manage departments, people and any tool; department owners edit and answer only for their own department's tools and unassigned ones; nobody outside the workspace sees anything. Checked on 2026-11-15 with simulated users (outsider, admin, department owner).
- Demo mode (no Supabase) keeps the team in the browser, and an empty workspace shows a read-only sample team (Northwind Logistics) until it has tools of its own.

## Setup notes for production

- **Email volume**: Supabase's built-in email sends only a few messages an hour. For real invites, set custom SMTP (Resend, Postmark…) under Authentication → Emails → SMTP.
- **Redirect URL**: add `https://outflow.radivarius.com/auth/confirm` (and `http://localhost:3000/auth/confirm`) under Authentication → URL Configuration → Redirect URLs. If it's missing, links still work: the app forwards sign-in tokens from any page to `/auth/confirm`.
- **Optional**: `SUPABASE_SERVICE_ROLE_KEY` (server only, never `NEXT_PUBLIC_`) switches the email to Supabase's proper invite template.

## Later

- Accounting and SSO connectors (step 2) to pre-fill tools, spend, active users and department assignment.
- Forward-to-email contract intake (`contracts@<company>.contractradar…`).
- Scheduled survey reminders and a weekly "who hasn't answered" digest to admins.
- Usage data (logins) next to survey answers in the low-value view.

## Landing page copy (for the public page)

**From "what are we paying for?" to a decision on every tool.**

1. **Connect in 10 minutes.** Your CFO sets up the workspace and invites one owner per department.
2. **Each team explains its tools.** Upload the contract and answer four questions: what it's for, how critical it is, what you'd use instead, and how many seats you need.
3. **Leadership sees the whole picture.** Overlapping tools across teams, high-cost low-value subscriptions, and a keep, cut seats, consolidate or renegotiate call before every renewal.
