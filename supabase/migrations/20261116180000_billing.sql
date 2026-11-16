-- Billing: Stripe subscriptions and the 14-day free trial, one row per workspace.
-- Run this whole file once in the Supabase SQL editor. It only adds things, so it is safe to run again.

create table if not exists public.workspace_billing (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  -- Free forever (your own workspace, partners, friendly pilots). Set it by hand in the SQL editor.
  complimentary boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  -- Stripe's subscription status: active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired, paused.
  -- Null until the workspace subscribes.
  status text,
  plan text check (plan in ('starter', 'growth', 'business')),
  billing_interval text check (billing_interval in ('month', 'year')),
  stripe_price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Every new workspace starts its free trial the moment it is created.
create or replace function public.start_workspace_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_billing (workspace_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.start_workspace_trial() from public, anon, authenticated;

drop trigger if exists workspaces_start_trial on public.workspaces;
create trigger workspaces_start_trial
  after insert on public.workspaces
  for each row execute function public.start_workspace_trial();

-- Workspaces that already exist get a fresh 14-day trial from today.
insert into public.workspace_billing (workspace_id)
select w.id from public.workspaces w
on conflict do nothing;

-- Members can see their workspace's plan. Only the server (service role: Stripe webhook, checkout) writes it,
-- so nobody can give themselves a plan from the browser.
alter table public.workspace_billing enable row level security;
drop policy if exists "members read billing" on public.workspace_billing;
create policy "members read billing" on public.workspace_billing
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
grant select on public.workspace_billing to authenticated;

-- To make a workspace free forever (for example your own):
--   update public.workspace_billing set complimentary = true
--   where workspace_id = (select id from public.workspaces where name = 'Your workspace name');
