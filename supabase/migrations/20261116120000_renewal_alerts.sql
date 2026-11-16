-- Renewal alerts: email reminders 90, 60 and 30 days before each notice deadline and renewal date.
-- Run this whole file once in the Supabase SQL editor. It only adds things, so it is safe to run again.

-- Admins can switch reminders off for the workspace (on by default).
alter table public.workspaces
  add column if not exists renewal_alerts boolean not null default true;

-- One row per reminder sent, so each one goes out exactly once.
create table if not exists public.renewal_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  kind text not null check (kind in ('notice', 'renewal', 'term_end')),
  event_date date not null,
  days_before int not null check (days_before > 0),
  recipient text not null,
  provider_id text,                         -- Resend's message id, for looking up delivery
  sent_at timestamptz not null default now(),
  unique (contract_id, kind, event_date, days_before, recipient)
);
create index if not exists renewal_alerts_workspace_idx on public.renewal_alerts (workspace_id, sent_at desc);

-- Members can see what was sent. Only the server job (service role) writes rows.
alter table public.renewal_alerts enable row level security;
drop policy if exists "members read renewal alerts" on public.renewal_alerts;
create policy "members read renewal alerts" on public.renewal_alerts
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
grant select on public.renewal_alerts to authenticated;
