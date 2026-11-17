-- Platform admin console (/admin): the people who run Contract Radar itself, across every workspace.
-- Run this whole file once in the Supabase SQL editor. It only adds things, so it is safe to run again.
--
-- Everything here is read and written only by the server with the service role key. Signed-in users get
-- no access at all (RLS on, no policies, grants revoked), so nothing can be read or changed from a browser.
--
-- After running it, make yourself the first platform admin (or set PLATFORM_ADMIN_EMAILS in Vercel):
--   insert into public.platform_admins (user_id, email)
--   select id, email from auth.users where email = 'you@example.com'
--   on conflict do nothing;

-- Who may open /admin. PLATFORM_ADMIN_EMAILS in the environment also counts, as a way in before this exists.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  added_by_email text,
  created_at timestamptz not null default now()
);

-- What platform admins did: disabled a user, comped a workspace, extended a trial, changed a role…
-- Actions on a workspace are also written to that workspace's own audit_log, so its admins see them too.
create table if not exists public.platform_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text not null,
  action text not null check (char_length(action) between 3 and 80),
  target_type text,            -- user, workspace, member, invite, billing, support, platform_admin
  target_id text,
  target_label text,
  workspace_id uuid references public.workspaces (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists platform_audit_log_time_idx on public.platform_audit_log (created_at desc);

-- Every message sent from Help & support, so they can be tracked and closed in /admin (the email still goes out).
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  name text,
  workspace_id uuid references public.workspaces (id) on delete set null,
  workspace_name text,
  topic text,
  message text not null,
  page text,
  attachment text,
  emailed boolean not null default false,
  status text not null default 'open' check (status in ('open', 'resolved')),
  note text,                   -- internal note from the admin who handled it
  resolved_at timestamptz,
  resolved_by_email text,
  created_at timestamptz not null default now()
);
create index if not exists support_requests_time_idx on public.support_requests (status, created_at desc);

-- Last run of each scheduled job (renewal reminders, import worker), for the health panel.
create table if not exists public.job_runs (
  job text primary key,
  last_run_at timestamptz not null default now(),
  ok boolean not null,
  summary jsonb not null default '{}'::jsonb,
  error text
);

alter table public.platform_admins enable row level security;
alter table public.platform_audit_log enable row level security;
alter table public.support_requests enable row level security;
alter table public.job_runs enable row level security;
revoke all on public.platform_admins, public.platform_audit_log, public.support_requests, public.job_runs from anon, authenticated;
