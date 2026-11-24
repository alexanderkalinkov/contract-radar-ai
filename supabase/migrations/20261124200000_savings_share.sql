-- Outflow: savings-share pricing ("no savings, no fee").
-- Adds the Savings plan (a small monthly platform fee, credited against the savings fee) and the savings ledger:
-- every saving that came from an Outflow recommendation, with its baseline, evidence and the customer's
-- confirmation. A confirmed saving on the Savings plan is invoiced once, through Stripe.
--
-- Run the whole file once in the Supabase SQL editor. It only adds things, so it is safe to run again.

-- ---------------------------------------------------------------------------
-- 1. Allow the new plan in workspace_billing
-- ---------------------------------------------------------------------------
alter table public.workspace_billing drop constraint if exists workspace_billing_plan_check;
alter table public.workspace_billing
  add constraint workspace_billing_plan_check check (plan in ('starter', 'growth', 'business', 'savings'));

-- ---------------------------------------------------------------------------
-- 2. The savings ledger
-- ---------------------------------------------------------------------------
create table if not exists public.savings_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- The contract the saving is on, and the approved renewal decision it came from (when there is one).
  contract_id uuid references public.contracts (id) on delete set null,
  review_id uuid references public.renewal_reviews (id) on delete set null,
  -- The signed document that proves the new price (optional).
  new_contract_id uuid references public.contracts (id) on delete set null,
  vendor text not null check (char_length(btrim(vendor)) between 1 and 200),
  -- Which Outflow recommendation produced it: an approved renewal decision, a pushback email, or a savings opportunity.
  source text not null check (source in ('approval', 'pushback', 'opportunity')),
  kind text not null check (kind in ('price', 'seats', 'cancel', 'consolidate', 'terms')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- What the next 12 months would have cost without Outflow (renewal quote, or current price plus the uplift),
  -- and what they cost now. Both are annual amounts.
  baseline_annual numeric not null check (baseline_annual > 0),
  new_annual numeric not null check (new_annual >= 0),
  annual_saving numeric generated always as (baseline_annual - new_annual) stored,
  baseline_note text not null check (char_length(btrim(baseline_note)) between 1 and 500),
  evidence text check (evidence is null or char_length(evidence) <= 4000),
  signed_on date,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'disputed', 'void')),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_by_email text,
  recorded_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_by_email text,
  confirmed_at timestamptz,
  dispute_note text check (dispute_note is null or char_length(dispute_note) <= 2000),
  -- The fee, fixed when the saving is confirmed so later price changes don't touch it.
  fee_rate numeric check (fee_rate is null or (fee_rate >= 0 and fee_rate <= 1)),
  fee_cap numeric check (fee_cap is null or fee_cap >= 0),
  fee_gross numeric check (fee_gross is null or fee_gross >= 0),
  credit_applied numeric check (credit_applied is null or credit_applied >= 0),
  fee_net numeric check (fee_net is null or fee_net >= 0),
  -- none: not confirmed yet. not_billed: the workspace is on a flat plan. credited: covered by platform fees.
  fee_status text not null default 'none' check (fee_status in ('none', 'not_billed', 'credited', 'invoiced', 'paid', 'failed', 'void')),
  stripe_invoice_id text unique,
  invoice_url text,
  invoiced_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (new_annual < baseline_annual)
);
-- One saving per approved renewal decision, so the same win can't be billed twice.
create unique index if not exists savings_ledger_review_uidx on public.savings_ledger (review_id) where review_id is not null and status <> 'void';
create index if not exists savings_ledger_workspace_idx on public.savings_ledger (workspace_id, recorded_at desc);
create index if not exists savings_ledger_contract_idx on public.savings_ledger (contract_id);

-- Members can read their workspace's ledger. Every write goes through the app's server (service role), which checks
-- who may record, confirm or dispute, works out the fee and talks to Stripe, so nobody can edit a fee from the browser.
alter table public.savings_ledger enable row level security;
drop policy if exists "members read savings" on public.savings_ledger;
create policy "members read savings" on public.savings_ledger
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
revoke all on public.savings_ledger from anon, authenticated;
grant select on public.savings_ledger to authenticated;
