-- Email-in contracts: every workspace gets its own inbox address, and contracts emailed to it
-- (PDF or Word attachments) are read by Claude like an upload.
-- Run this whole file once in the Supabase SQL editor. It only adds things, so it is safe to run again.
--
-- The address is <workspace-name>.<inbox_token>@<INBOUND_EMAIL_DOMAIN>. Only the token after the last dot
-- picks the workspace, so renaming the workspace never breaks an address people have saved.

-- 10 lowercase letters and digits, without look-alikes (0/o, 1/l). Uses the random bytes of a v4 UUID
-- (skipping the two bytes that hold version bits), so it needs no extension.
create or replace function public.new_inbox_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('abcdefghijkmnpqrstuvwxyz23456789', 1 + (pg_catalog.get_byte(r.b, i) % 32), 1), '' order by i)
  from (select pg_catalog.decode(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 'hex') as b) r,
       unnest(array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13]) as i;
$$;

alter table public.workspaces
  add column if not exists inbox_token text;

update public.workspaces set inbox_token = public.new_inbox_token() where inbox_token is null;

alter table public.workspaces
  alter column inbox_token set default public.new_inbox_token(),
  alter column inbox_token set not null;

create unique index if not exists workspaces_inbox_token_idx on public.workspaces (inbox_token);

-- Only the server (service role) may change the token, so a member can't point the inbox somewhere else.
-- "Get a new address" in Workspace settings goes through the server, which checks the person is an admin.
create or replace function public.protect_inbox_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.inbox_token is distinct from old.inbox_token and coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' then
    new.inbox_token := old.inbox_token;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_inbox_token on public.workspaces;
create trigger protect_inbox_token
  before update on public.workspaces
  for each row execute function public.protect_inbox_token();

-- ---------------------------------------------------------------------------
-- Log of every email that reached a workspace inbox, shown in Workspace settings.
-- Written only by the server (the inbound webhook), read by workspace members.
-- ---------------------------------------------------------------------------

create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  provider_email_id text not null unique,   -- Resend's email id; makes webhook retries harmless
  from_email text,
  subject text,
  status text not null default 'processing' check (status in ('processing', 'done', 'partial', 'rejected', 'failed')),
  detail text,
  contract_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists inbound_emails_workspace_idx on public.inbound_emails (workspace_id, created_at desc);

alter table public.inbound_emails enable row level security;

drop policy if exists "members read inbound emails" on public.inbound_emails;
create policy "members read inbound emails" on public.inbound_emails
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));

grant select on public.inbound_emails to authenticated;

-- Contracts that came in by email remember it, so the app can say so.
alter table public.contracts
  add column if not exists source text not null default 'upload' check (source in ('upload', 'email'));

-- Word files can now be stored next to PDFs in the private bucket.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'contracts';
