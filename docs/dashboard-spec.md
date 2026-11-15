# Savings Dashboard: Product Spec

Status: draft for review
Owner: Alex
Last updated: 2026-11-15
Visual reference: [clickable mockup](https://claude.ai/artifact/JEo2NkLjt5ERuQHxg4k3EP) (private, ask Alex for access). The screens are the savings dashboard, the contract renewal detail and the connect-sources onboarding.

---

## 1. What the dashboard is for

Contract Radar AI helps mid-market companies (50 to 1,000 employees) cut SaaS spend. The buyer and main user is the **CFO, VP Finance or procurement lead**. They log in about once a week, usually after the Monday digest email, and they want answers to three questions in under a minute:

1. **How much money can we save?** (total identified savings)
2. **What do I have to act on, and by when?** (deadlines)
3. **What is the single next thing to do?** (ranked opportunities with one action each)

Everything on the dashboard either answers one of these questions or points to the screen that does. If a widget answers none of them, it does not go on the dashboard.

### Design principles

- **Money and the deadline travel together.** Every finding shows a $ amount *and* an "act by" date. A saving with no deadline gets deprioritised. A deadline with no $ attached gets ignored.
- **One action per finding.** Each row ends in a single verb, such as "Send pushback", "Reduce seats" or "Plan consolidation". The secondary options live on the detail page.
- **Show the evidence.** Every number can be traced to a source: a contract clause and its page, login data, or a spend line. Finance users do not trust black-box numbers.
- **Annualised dollars, always.** Every amount is per year unless it is labelled otherwise, so different findings can be compared directly.
- **Urgency is shown in colour *and* text.** Use "in 5 days" alongside the colour. Never rely on colour alone.

---

## 2. Page layout

Desktop (1280 px and wider), top to bottom:

```
┌──────────┬───────────────────────────────────────────────────────────┐
│          │ A. Header: company · week · [Preview digest] [Upload]     │
│          ├───────────────────────────────────────────────────────────┤
│  Side    │ B. KPI strip (4 tiles)                                    │
│  nav     ├───────────────────────────────────────────────────────────┤
│          │ C. Urgent banner (only when a deadline is ≤ 7 days away)  │
│          ├─────────────────────────────────────┬─────────────────────┤
│          │ D. Savings opportunities table      │ E. Notice deadlines │
│          │    (filters, sort, top 8 rows)      ├─────────────────────┤
│          │                                     │ F. Savings by lever │
│          │                                     ├─────────────────────┤
│          │                                     │ G. Digest preview   │
└──────────┴─────────────────────────────────────┴─────────────────────┘
```

- The main column (D) takes about two thirds of the width and the side column (E–G) about one third.
- **Priority order** is A → B → C → D → E → F → G. On tablet and phone the side column moves below the table in the same order, and the side nav collapses into a top menu.
- The content is capped at about 1,240 px wide so the table does not stretch on large monitors.

### Side navigation (persistent)

| Item | Goes to | Notes |
|---|---|---|
| Savings | This dashboard | Default landing page |
| Contracts | Contract list → contract detail | One record per vendor agreement |
| Renewal calendar | Month view of every notice and renewal date | Can export to iCal or Google Calendar |
| Seats & usage | Per-app seat usage from identity data | |
| Price changes | Renewal quotes vs. caps, plus pricing and ToS change radar | |
| Sources | Connect-sources screen | Shows which sources are connected and when each last synced |

At the bottom of the nav is a **Spend under management** card ($/yr, number of apps, plan name). It reminds the buyer what they are paying for, because pricing is tiered by spend under management.

---

## 3. Sections in detail

### A. Header

| | |
|---|---|
| **Purpose** | Context (which company, which week) plus the two most common global actions. |
| **Shows** | Company name, "Week of {date}", the page title "Savings overview". |
| **Actions** | **Preview weekly digest** (opens the email exactly as it will be sent). **Upload contract** (primary button, opens the upload flow). |
| **Later** | A workspace switcher, for agencies or groups with several entities. |

### B. KPI strip

There are four tiles, in this order. The first tile is visually dominant (dark background) because it carries the headline number.

| # | Tile | Value | Sub-line | Calculation |
|---|---|---|---|---|
| 1 | **Identified savings** | `$412,600 /yr` | "23 opportunities · 14.5% of spend" | Sum of `annual_savings` over open opportunities. "% of spend" = identified ÷ spend under management. |
| 2 | **At stake in next 30 days** | `$119,857` (orange) | "3 notice deadlines · first in 5 days" | Sum of open opportunities whose `act_by` falls within 30 days. Count distinct deadline dates. |
| 3 | **Captured this year** | `$86,200` (green) + progress bar | "21% of identified · 9 wins" | Sum of opportunities with status `won` in the current fiscal year. |
| 4 | **Contracts tracked** | `64 of 137 apps` | "73 apps have no contract on file" | Apps with at least one contract document ÷ apps detected from spend and identity data. |

- Clicking tile 1 opens the full opportunities list. Tile 2 opens the opportunities list filtered to the next 30 days. Tile 3 opens a "Wins" report, which is also the proof for savings-share billing. Tile 4 opens the list of apps with no contract, each with an "Upload" button.
- Tile 4 is on the dashboard on purpose. It is the coverage gap, and closing it is what grows identified savings.

### C. Urgent banner

| | |
|---|---|
| **Purpose** | Make it impossible to miss a cancellation window. Missing one is the most expensive failure the product can let happen. |
| **Shows when** | At least one open opportunity has `act_by` ≤ 7 days away. If there are several, show the earliest and add "+2 more this week". |
| **Content** | "**Slack auto-renews in 5 days.** Cancel or resize 96 inactive seats before **Nov 20** or you are locked in for 12 more months at $14,976 extra." |
| **Action** | **Review now** opens that opportunity's contract detail. |
| **Dismiss** | Snooze for 24 hours only. It cannot be dismissed for good while the deadline is open. |

### D. Savings opportunities table (core of the page)

| | |
|---|---|
| **Purpose** | The ranked to-do list of money. |
| **Default sort** | **Soonest deadline**. The toggle switches to **Biggest $**. Ties break by the other key. |
| **Filters** (pills with counts) | All · Unused seats · Price increases · Duplicate tools · Terms changes (and Missed auto-renewals once that lever ships). |
| **Rows** | Top 8, then a "View all opportunities" link to the full list. |
| **Summary line** | "{n} shown · ${sum} per year". It updates with the filters. |

**Columns**

| Column | Content | Source |
|---|---|---|
| Vendor & finding | Logo, vendor name, then a one-line finding in plain English, e.g. "Renewal quote +12%, contract caps uplift at 5% (§8.2)" | Opportunity engine |
| Lever | Coloured tag: Unused seats / Price increase / Duplicate tools / Terms change | Opportunity type |
| Savings / yr | Green, right-aligned. Terms changes show "up to $X" because the amount is an estimate. | `annual_savings` |
| Act by | Date, plus a "in N days" badge. Solid orange if ≤ 7 days, light orange if ≤ 30, grey otherwise. | `act_by` (see §4) |
| Action | One verb button | Opportunity type → default action |

**Row interactions**

- Click the row or the action button to open the **opportunity detail** (for contract-based findings, this is the contract renewal view).
- Hover or the overflow menu gives: Snooze (until a date), Assign to a person, Mark as won (enter the actual amount saved), Dismiss (pick a reason: "not relevant", "already handled", "wrong data"). The dismiss reason feeds model quality.
- The same vendor can appear twice when two levers apply, for example Salesforce price cap and Salesforce unused seats. They are separate rows because they have separate actions, but they are combined into one ask on the detail page.

### E. Notice deadlines

| | |
|---|---|
| **Purpose** | A calendar-style glance at the next 90 days of deadlines, including ones with no savings attached yet. |
| **Shows** | Up to 5 items: a date block (month and day, coloured by urgency), vendor, what happens on that date ("Auto-renews · 30-day notice", "Seat true-down deadline", "Cancel before auto-renew") and the $ at stake. |
| **Action** | Click an item to open the contract. "Open renewal calendar" goes to the full calendar. |
| **Difference from D** | D lists *opportunities*. E lists *dates*. A renewal with $0 identified savings still shows in E, because the user may still want to renegotiate it. |

### F. Savings by lever ("Where the money is")

| | |
|---|---|
| **Purpose** | Shows which levers drive value. It helps the buyer explain the product internally and shows us which integrations matter most. |
| **Shows** | Horizontal bars, one per lever, sorted by $. Example: Unused seats $187.4K · Duplicate tools $96.3K · Price increases over cap $71.9K · Missed auto-renewals avoided $39K · Terms & pricing changes $18K. |
| **Action** | Click a bar to apply that lever's filter to table D. |

### G. Weekly digest preview

| | |
|---|---|
| **Purpose** | Shows that the product keeps working when the user is not logged in. The digest is the main retention loop. |
| **Shows** | Next send time, number of recipients, and what the digest will contain (new findings, deadlines this month, drafts ready to send). |
| **Action** | Click to open the digest preview and settings (recipients, day and time, which thresholds trigger an instant alert instead of waiting for Monday). |

---

## 4. Data model behind the dashboard

The minimum entities the dashboard needs:

| Entity | Key fields | Populated from |
|---|---|---|
| `vendor` | name, logo, category (CRM, video, PM…) | Spend data + identity app catalogue |
| `contract` | vendor, documents, term start and end, auto-renew (y/n), renewal term length, notice period (days), uplift cap (%), seat-reduction allowance (%), annual fee, seats, owner | **AI extraction** from uploaded PDF/DOCX. Every field stores the source page, the quoted text and a confidence level. |
| `usage` | app, seats paid, active users (30/60/90 days), never signed in | Google Workspace / Microsoft 365 (Entra ID) / Okta |
| `spend_line` | vendor, amount, date, payment method | QuickBooks / Xero / card programs (Ramp, Brex, Amex, CSV) |
| `quote` | vendor, quoted annual fee, quoted seats, received date | Uploaded or forwarded renewal quote |
| `pricing_snapshot` | vendor, page URL, captured text and hash, date | Pricing-page and ToS monitor |
| `opportunity` | type (lever), vendor, contract, `annual_savings`, `act_by`, status (`open`, `snoozed`, `in_progress`, `won`, `dismissed`), evidence links, default action | **Opportunity engine** (rules over the entities above) |

### How `act_by` is calculated

- Auto-renewal: `term_end − notice_period_days`
- Price pushback: the same notice date (you lose leverage once the renewal is locked in), or the quote expiry date if that is earlier
- Seat reduction: the contract's true-down date, or else the notice date
- Duplicate tools: the notice date of the tool being retired
- Terms change: the effective date of the change

### How each lever calculates `annual_savings`

| Lever | Rule | Example |
|---|---|---|
| Unused seats | (seats paid − active seats in 60 days, capped at the contract's reduction allowance) × per-seat price at renewal | Salesforce: 34 × $1,675.80 = $56,977 |
| Price increase over cap | quoted fee − (current fee × (1 + cap)) | $357,504 − $335,160 = $22,344 |
| Duplicate tools | Cost of the tool being retired, minus the cost of extra seats on the tool being kept | Asana + Monday.com: $41,800 |
| Missed auto-renewal avoided | Annual fee of a tool flagged as unused or unwanted, if cancelled before the notice date | |
| Terms / pricing change | Estimated annual cost difference under the new terms, shown as "up to" | HubSpot: up to $18,000 |

Each lever has a **confidence level**. Low-confidence findings show a "Needs review" tag and stay out of KPI tile 1 until a user confirms them. This keeps the headline number credible.

---

## 5. States

### 5.1 First login, nothing connected (onboarding)

The dashboard is not shown empty. The user lands on **Connect sources**:

1. **Upload 3 contracts, free.** Drag and drop. Each file shows live progress ("Reading clauses, page 6 of 14"), then what was found ("Notice Dec 1, 5% cap found"). This is the free audit and the top of the funnel.
2. **Connect logins** (Google Workspace, Microsoft 365, Okta). This unlocks *unused seats*.
3. **Connect spend** (QuickBooks, Xero, cards). This unlocks *duplicate tools* and finds apps that have no contract on file.
4. **Weekly digest recipients.**

The side panel shows a **"Found so far" counter**, a $ amount that goes up as each source connects, and a checklist of which levers are unlocked. A trust note ("Read-only: we see sign-in dates and license counts, never email or file content") and a pricing note sit below it.

### 5.2 Partially connected

- The dashboard renders with the data it has.
- Levers that are not unlocked appear in table D's filter pills as **locked** ("Unused seats: connect Okta to unlock"), and in section F as a ghost bar with a "Connect" link.
- KPI tile 4 becomes the main nudge to upload more contracts.

### 5.3 Contracts uploaded, extraction pending

- Opportunities show with a "Processing" shimmer instead of a $ amount. Nothing is counted in the KPIs until it is extracted.
- Show the expected time, e.g. "About 2 minutes per contract".

### 5.4 Everything handled (inbox zero)

- Table D shows: "No open opportunities. Next renewal is Gong on Dec 28. We'll flag anything new in Monday's digest."
- The KPI tiles still show captured savings, which is the "you're getting value" moment.

### 5.5 Errors

- **A source disconnected or its token expired**: a yellow strip at the top: "Okta stopped syncing 3 days ago. Seat findings may be out of date. Reconnect". Findings that depend on that source get a "stale" marker.
- **Extraction confidence too low**: the contract opens in a review mode with the uncertain fields highlighted, and the user confirms or corrects them.

---

## 6. Detail view: contract renewal (linked from D, C and E)

This is not part of the dashboard itself, but every dashboard action opens it, so it is summarised here.

1. **Header**: vendor, contract name, status chip ("Renewal quote received Nov 10"), owner, document references. On the right, a large **notice deadline** with a day count.
2. **Renewal timeline**: quote received → today → last day to give notice → auto-renew date.
3. **Renewal math**: current fee → vendor quote → maximum allowed under the cap → right-sized fee. An "What to ask for" toggle (Enforce cap / Cap + cut seats) updates the savings figure.
4. **Clauses that matter**: each extracted clause with the quoted text, the page reference, a confidence level and a one-line "what this means for you".
5. **Seat usage**: active, inactive for 60+ days, and never signed in, from identity data.
6. **Pushback email**: AI draft that cites the clauses, with a tone toggle (Firm / Friendly), "Open in Gmail/Outlook and send", "Copy text", and "Mark as sent". After sending, the opportunity moves to `in_progress`, and the app tracks the reply and sends a follow-up reminder.

When the vendor comes back with a revised quote, the user uploads it, and the app records the difference as **captured savings** (KPI tile 3, and the basis for savings-share billing).

---

## 7. Metrics for the dashboard itself

- **Time to first $**: from sign-up to the first opportunity shown. Target: under 10 minutes with one contract.
- **Weekly active finance users** per account, opened from the digest or directly.
- **Action rate**: % of opportunities that reach `in_progress` or `won` before `act_by`.
- **Missed deadlines**: opportunities whose `act_by` passed while still `open`. Target: zero. This is the product's core promise.
- **Dismiss reasons**: how often each reason is chosen, to measure finding quality.

---

## 8. Scope: B2B first, B2C later

**Now: B2B (mid-market SaaS spend).** Everything above is the B2B product.

**Later: B2C household bills** (energy, broadband, mobile, insurance, subscriptions). The same engine reuses directly:

| Engine piece | B2B | B2C |
|---|---|---|
| Document extraction | SaaS MSAs and order forms | Energy, broadband and mobile contracts, terms PDFs, bills |
| Deadline engine (`act_by`) | Notice periods, auto-renewal | End of fixed-term tariff, minimum term end, cooling-off periods |
| Price-change detection | Uplift cap vs. renewal quote, pricing-page and ToS radar | Mid-contract price rises (e.g. CPI + X%), tariff changes vs. contract terms |
| Usage vs. paid | Seats vs. logins | Data allowance vs. actual use, unused subscriptions |
| Spend ingestion | QuickBooks, Xero, cards | Open-banking feed or bank CSV |
| Action drafting | Pushback email to the account executive | Complaint, cancellation or switching letter to the provider |
| Benchmarking (later) | Peer SaaS pricing | Market tariffs and switching offers |

Implications for the B2B build, so B2C stays cheap later:

- Keep `vendor`, `contract`, `opportunity` and `act_by` **generic**, not SaaS-specific. Lever types are a registry, not hard-coded columns.
- Keep extraction schemas per **document type** (SaaS MSA, energy tariff…) as config.
- The dashboard layout carries over almost as is: KPI strip → deadlines → ranked opportunities → digest. B2C would simplify it to a single "money you can save" number and a list. The language changes (no "seats", no "procurement").
- B2C is a different go-to-market (consumer acquisition, smaller tickets, likely savings-share or a flat subscription), so it stays out of scope until B2B has paying customers.

---

## 9. Open questions

1. Does "Captured this year" use the calendar year or the customer's fiscal year? (Recommendation: fiscal year, configurable at onboarding.)
2. Do we show identified savings before a human confirms them? (Recommendation: yes for high confidence, "Needs review" for the rest, as in §4.)
3. Savings-share billing: what counts as "captured"? This needs a clear rule, e.g. the difference between the original quote and the signed amount, confirmed by an uploaded signed order form.
4. Multi-user roles: is a procurement lead allowed to send pushback emails, or only to draft them for the CFO?
5. Which identity source do we build first? (Recommendation: Google Workspace, because it has the broadest mid-market reach, then Okta.)
