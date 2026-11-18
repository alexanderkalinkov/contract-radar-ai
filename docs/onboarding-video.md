# Onboarding video

A 6½-minute guided tour for new users (re-recorded 2026-11-17 for the grouped sidebar, first sign-in tour and Help & support, and again on 2026-11-18 for the Outflow rebrand: new name in the narration, Outflow logo and Sora title cards), recorded from the real app with a test account and the Northwind demo workspace.

- **Video:** `contract-radar-onboarding.mp4` (1440x900). Kept out of git because of its size. The Help page and the first sign-in tour play it from the public Supabase Storage bucket `help` (`help/contract-radar-onboarding.mp4`, a 34 MB crf 22 copy). A 24 MB sharing copy and the edit scripts (`edit/build.py`, `edit/upload.mjs`) are on Alex's Mac in `Claude Code/onboarding-video/`.
- **Voice:** Kokoro text-to-speech (voice `af_heart`), one clip per scene.
- **Script:** below. The voiceover follows it word for word.

## How it was made
1. The screens were recorded with Playwright on localhost (fake cursor overlay, typed input, one clip per scene). Local "setup needed" notices for keys that only exist in production were hidden with CSS.
2. The clips were trimmed and sped up (1.2x to 2.2x) to fit each voiceover paragraph, with a scene caption bottom right and title cards at both ends (ffmpeg).
3. Re-record a scene when its screen changes a lot, re-run the edit, then upload the new file to the `help` bucket (upsert) and refresh `public/help/tour-poster.jpg`. The recorder scripts are in `Claude Code/onboarding-video/recorder/` on Alex's Mac.

Known gaps: on the recording, the "Email contracts in" card shows no inbox address, reminders show Off and Billing shows no trial status, because the local copy has no Resend or Stripe keys.

---

# Outflow: getting started (onboarding video script)

Length: about 7 minutes. Narrator: one calm voice, second person ("you"). Each scene lists what's on screen, then the voiceover.
Sample company on screen: Northwind Logistics (fictional). No real customer data.

---

## 1. Welcome (0:00)
**Screen:** Landing page, then click "Start free audit".

Welcome to Outflow. In the next few minutes you'll see how to go from a brand new account to a clear keep, cut or renegotiate decision on every software tool your company pays for. We'll use a sample company, Northwind Logistics, so you can see the whole platform with real-looking data.

## 2. Create your account (0:20)
**Screen:** Create account form: name, work email, password, company name. Confirmation email, then first sign-in.

Start by creating your account with your work email. Outflow creates a private workspace for your company, and you become its admin. Confirm your email and sign in. The first time you do, this tour offers to play, and you can always come back to it from Help.

## 3. Set up your company (0:40)
**Screen:** Setup wizard: company step, connect step, departments, invite owners, add tools, done.

Setup takes about ten minutes, and you can change everything later. First, tell us about your company. Next, you can connect your accounting and sign-in tools, like QuickBooks, Xero, Google Workspace or Microsoft 365, so Outflow can find every tool you pay for automatically. Then pick the departments that buy software, and invite one owner for each. Owners get an email, sign in straight into their department, and confirm their tools. Finally, add a few tools by hand if you like, and you're set up.

## 4. Roles (1:25)
**Screen:** Team page: the four roles, departments, people with their role dropdowns, invite row.

Everyone in your workspace has a role. Admins manage billing, sources and settings. Approvers sign off on renewal decisions. Department owners look after their own team's tools. And viewers can see everything but change nothing, which is perfect for your auditor or board. You can change anyone's role here on the Team page, and resend an invite if it got lost.

## 5. Department owners answer the survey (1:55)
**Screen:** Tools & survey list, open one tool, fill the four questions.

Each department owner sees the tools filed under their team and answers four quick questions per tool: what it's used for, how critical it is, what you'd use instead, and whether you need every seat. Saving one answer jumps straight to the next tool, so a whole department takes just a few minutes.

## 6. Add your contracts (2:20)
**Screen:** Upload page, drop a PDF, extraction appears. Then Workspace settings, "Email contracts in" card. Then Bulk import.

Now the most important step: your contracts. There are three ways to add them. Drop a PDF or Word file on the Upload page. Or forward a contract to your workspace's own email inbox, which you'll find in Workspace settings; anything a team member sends there is read and filed automatically. And if you have hundreds of contracts in a folder, use Bulk import: drop a ZIP or a whole folder, and Outflow reads them in the background, skips duplicates, and lets you review everything before it's added.

## 7. AI extraction with source quotes (3:00)
**Screen:** Contract page: extracted terms with quotes and page numbers, Confirm and Correct buttons.

Within seconds, Claude reads each contract and pulls out the terms that cost you money: the renewal date, the notice deadline, auto-renewal, the price uplift cap, seat reduction rights and the annual fee. Every term comes with the exact sentence from the contract and the page it's on, so you never have to take the AI's word for it. If something looks wrong, click Correct, or click Confirm to mark it checked.

## 8. The dashboard (3:35)
**Screen:** Savings overview with the grouped sidebar and section tabs: savings tile, at-stake, unused seats, captured; auto-renew alert; opportunities list; notice deadlines.

This is your savings overview. The sidebar groups everything into a few sections: contracts, renewals, tools and seats, and settings, with tabs across the top of each page. At the top you see identified savings, how much is up for renewal in the next thirty days, seats nobody uses, and the savings you've already captured. Urgent alerts, like a tool that auto-renews in a few days, appear right here with a button to act on them.

## 9. Savings ideas and pushback emails (4:00)
**Screen:** Opportunities list, open Salesforce, "Draft pushback email", email appears.

Below that, every savings opportunity is ranked: unused seats, price increases, duplicate tools and terms changes. Open one and Outflow shows the numbers behind it. Click Draft email and Claude writes a pushback email to the vendor, citing the exact clause in your contract. Edit it, copy it, and send it from your own inbox.

## 10. Price-hike tracking (4:35)
**Screen:** Price changes page: quotes vs previous term, over-cap amounts; pricing & terms radar.

When a renewal quote arrives, upload it too. Outflow matches it to the current contract, compares the new price with what you pay today, and checks it against your uplift cap. Anything over the cap is flagged in red with the dollar amount, ready for a pushback email.

## 11. Renewal alerts and calendar (5:00)
**Screen:** Renewal calendar month grid, "Add to my calendar", reminder settings.

You'll never miss a notice deadline again. Department owners and admins get reminder emails ninety, sixty and thirty days before every deadline. The renewal calendar shows them all at a glance, and you can add them to Google Calendar or Outlook with one click.

## 12. Renewal approvals (5:25)
**Screen:** Approvals page: needs recommendation, waiting for approval; recommend form; approve.

For each renewal, the department owner recommends what to do: keep, cut seats, consolidate, renegotiate or cancel. An admin or approver then approves it or sends it back with a note. Every step is logged, so you always know who decided what, and why.

## 13. Leadership view (5:55)
**Screen:** Leadership view: KPIs, overlapping tools, recommendation per tool.

Admins also get the leadership view: total spend tracked, estimated savings, survey progress, and the teams paying for different tools that do the same job, with a recommendation for every tool.

## 14. Audit log and workspace settings (6:15)
**Screen:** Audit log, then Workspace settings: entities and cost centres, SSO card.

The audit log records every change in your workspace, and you can export it to CSV for your auditors. In Workspace settings you can add your legal entities, currencies and cost centres, set up single sign-on for your team, and choose who gets reminder emails.

## 15. Billing, help and wrap-up (6:40)
**Screen:** Billing page (plans), then Help & support (tour video, contact form), then back to the dashboard.

Billing shows the plans, and you can pick one any time. If you ever get stuck, open Help and support at the bottom of the sidebar. You can watch this tour again, or send us a message and we'll get back to you. That's it. Create your account, invite your department owners, upload your contracts, and Outflow will show you where your money is going and help you get it back. Welcome aboard.
