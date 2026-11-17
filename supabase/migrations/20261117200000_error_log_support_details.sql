-- Error log and fuller support messages for the platform admin console.
-- Run this whole file once in the Supabase SQL editor. It only adds things, so it is safe to run again.
-- Needs platform-admin.sql (20261117120000) first.

-- Everything the support email shows, kept with the message.
alter table public.support_requests add column if not exists role text;
alter table public.support_requests add column if not exists plan text;
alter table public.support_requests add column if not exists is_demo boolean;
alter table public.support_requests add column if not exists browser text;
alter table public.support_requests add column if not exists errors jsonb not null default '[]'::jsonb;
alter table public.support_requests add column if not exists attachment_path text;   -- object in the private "support" bucket

-- Attachments people add to a support message. Private: only the server (service role) reads or writes it,
-- and the admin console hands out short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit)
values ('support', 'support', false, 3145728)
on conflict (id) do nothing;

-- Problems people ran into: failed API calls, uploads that didn't go through, crashes, pages that don't exist.
-- Written by the server only (POST /api/errors and server code), read in /admin → Setup & health.
create table if not exists public.app_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('api', 'upload', 'crash', 'not_found', 'server')),
  status int,                 -- HTTP status for api / not_found
  message text not null,
  page text,                  -- where the person was
  endpoint text,              -- the API route that failed
  user_id uuid references auth.users (id) on delete set null,
  email text,
  workspace_id uuid references public.workspaces (id) on delete set null,
  browser text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists app_errors_time_idx on public.app_errors (created_at desc);
create index if not exists app_errors_kind_idx on public.app_errors (kind, created_at desc);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;
