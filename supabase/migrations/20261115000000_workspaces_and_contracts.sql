-- Contract Radar: shared workspaces, members, invites and saved contracts.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  show_sample_data boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);
create index if not exists workspace_invites_email_idx on public.workspace_invites (email);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  uploaded_by_email text,
  file_name text not null,
  file_path text,                 -- object path in the private "contracts" storage bucket
  vendor text not null,
  agreement_name text,
  term_end date,
  auto_renew boolean,
  renewal_term_months int,
  notice_days int,
  notice_deadline date,           -- term_end − notice_days, computed by the app
  uplift_cap_pct numeric,
  seat_reduction_pct numeric,
  annual_fee numeric,
  seats int,
  currency text,
  extraction jsonb not null,      -- full structured output, with quotes, pages and confidence
  model text,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contracts_workspace_idx on public.contracts (workspace_id, notice_deadline);

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_owner(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Called by the app after every sign-in. Accepts pending invites for the user's
-- email, creates a first workspace if they have none, and returns the workspace
-- they should land in (the one they joined most recently).
create or replace function public.bootstrap_workspace()
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  ws public.workspaces;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select lower(u.email) into user_email from auth.users u where u.id = uid;

  insert into public.workspace_members (workspace_id, user_id, email, role)
  select i.workspace_id, uid, user_email, 'member'
  from public.workspace_invites i
  where i.email = user_email
  on conflict do nothing;
  delete from public.workspace_invites i where i.email = user_email;

  select w.* into ws
  from public.workspaces w
  join public.workspace_members m on m.workspace_id = w.id
  where m.user_id = uid
  order by m.created_at desc, w.created_at desc
  limit 1;

  if ws.id is null then
    insert into public.workspaces (name, created_by)
    values (coalesce(split_part(user_email, '@', 2), 'My') || ' workspace', uid)
    returning * into ws;
    insert into public.workspace_members (workspace_id, user_id, email, role)
    values (ws.id, uid, user_email, 'owner');
  end if;

  return ws;
end;
$$;

revoke all on function public.bootstrap_workspace() from public, anon;
grant execute on function public.bootstrap_workspace() to authenticated;
revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
revoke all on function public.is_workspace_owner(uuid) from public, anon;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: you only see workspaces you belong to.
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.contracts enable row level security;

drop policy if exists "members read workspace" on public.workspaces;
create policy "members read workspace" on public.workspaces
  for select to authenticated using ((select public.is_workspace_member(id)));
drop policy if exists "owners update workspace" on public.workspaces;
drop policy if exists "members update workspace" on public.workspaces;
create policy "members update workspace" on public.workspaces
  for update to authenticated using ((select public.is_workspace_member(id))) with check ((select public.is_workspace_member(id)));

drop policy if exists "members read members" on public.workspace_members;
create policy "members read members" on public.workspace_members
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "owners remove members" on public.workspace_members;
create policy "owners remove members" on public.workspace_members
  for delete to authenticated
  using ((select public.is_workspace_owner(workspace_id)) and user_id <> (select auth.uid()));

drop policy if exists "members read invites" on public.workspace_invites;
create policy "members read invites" on public.workspace_invites
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "members invite" on public.workspace_invites;
create policy "members invite" on public.workspace_invites
  for insert to authenticated with check ((select public.is_workspace_member(workspace_id)));
drop policy if exists "members cancel invites" on public.workspace_invites;
create policy "members cancel invites" on public.workspace_invites
  for delete to authenticated using ((select public.is_workspace_member(workspace_id)));

drop policy if exists "members read contracts" on public.contracts;
create policy "members read contracts" on public.contracts
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "members add contracts" on public.contracts;
create policy "members add contracts" on public.contracts
  for insert to authenticated with check ((select public.is_workspace_member(workspace_id)));
drop policy if exists "members update contracts" on public.contracts;
create policy "members update contracts" on public.contracts
  for update to authenticated using ((select public.is_workspace_member(workspace_id))) with check ((select public.is_workspace_member(workspace_id)));
drop policy if exists "members delete contracts" on public.contracts;
create policy "members delete contracts" on public.contracts
  for delete to authenticated using ((select public.is_workspace_member(workspace_id)));

grant select, update on public.workspaces to authenticated;
grant select, delete on public.workspace_members to authenticated;
grant select, insert, delete on public.workspace_invites to authenticated;
grant select, insert, update, delete on public.contracts to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for contract PDFs, one folder per workspace
-- (object name = "<workspace_id>/<contract_id>.pdf").
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

drop policy if exists "members read contract files" on storage.objects;
create policy "members read contract files" on storage.objects
  for select to authenticated
  using (bucket_id = 'contracts' and (select public.is_workspace_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists "members upload contract files" on storage.objects;
create policy "members upload contract files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contracts' and (select public.is_workspace_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists "members delete contract files" on storage.objects;
create policy "members delete contract files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contracts' and (select public.is_workspace_member(((storage.foldername(name))[1])::uuid)));
