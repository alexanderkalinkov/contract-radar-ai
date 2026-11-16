-- Contract Radar: enterprise basics, part 2. Audit log, entities (brands) with cost centres, and SAML SSO.
-- Builds on 20261116215000_roles.sql. Safe to re-run in the Supabase SQL editor.

-- ===========================================================================
-- 1. Audit log
-- Append only: rows are written by triggers and by log_audit(), never edited.
-- Admins and approvers can read their workspace's log.
-- ===========================================================================

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,                 -- kept even if the user is deleted later
  action text not null check (char_length(action) between 3 and 80),   -- e.g. contract.created, member.role_changed
  target_type text,                 -- contract, member, invite, department, tool, entity, cost_centre, sso, workspace
  target_id text,
  target_label text,                -- human name at the time, e.g. "Salesforce" or "ana@acme.com"
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_ws_time_idx on public.audit_log (workspace_id, created_at desc);
create index if not exists audit_log_ws_action_idx on public.audit_log (workspace_id, action);

alter table public.audit_log enable row level security;
drop policy if exists "admins and approvers read audit log" on public.audit_log;
create policy "admins and approvers read audit log" on public.audit_log
  for select to authenticated using ((select public.can_approve_renewals(workspace_id)));
grant select on public.audit_log to authenticated;
-- No insert, update or delete grants: only the security definer functions below write here.

-- Who is acting: the signed-in user, or "system" for cron jobs and server tasks.
create or replace function public.audit_actor_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif((select auth.jwt()) ->> 'email', ''),
    (select u.email from auth.users u where u.id = (select auth.uid())),
    'system'
  );
$$;

-- For events the database can't see on its own (sign-ins, PDF opened, export). Members only, as themselves.
create or replace function public.log_audit(
  ws uuid,
  action text,
  target_type text default null,
  target_id text default null,
  target_label text default null,
  details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_member(ws) then
    raise exception 'not a member of this workspace';
  end if;
  insert into public.audit_log (workspace_id, actor_id, actor_email, action, target_type, target_id, target_label, details)
  values (ws, auth.uid(), public.audit_actor_email(), left(action, 80), target_type, target_id, left(target_label, 200), coalesce(details, '{}'::jsonb));
end;
$$;

-- One sign-in row in every workspace the user belongs to.
create or replace function public.log_sign_in(method text default 'password')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.audit_log (workspace_id, actor_id, actor_email, action, target_type, target_label, details)
  select m.workspace_id, auth.uid(), public.audit_actor_email(), 'auth.signed_in', 'member', m.email,
         jsonb_build_object('method', left(method, 20))
  from public.workspace_members m
  where m.user_id = auth.uid();
end;
$$;

revoke all on function public.log_audit(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.log_audit(uuid, text, text, text, text, jsonb) to authenticated;
revoke all on function public.log_sign_in(text) from public, anon;
grant execute on function public.log_sign_in(text) to authenticated;
revoke all on function public.audit_actor_email() from public, anon;

-- Which fields changed between two versions of a row: {"field": {"from": old, "to": new}}.
-- Skips bookkeeping columns and anything long (like the full extraction JSON).
create or replace function public.audit_changes(old_row jsonb, new_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', old_row -> n.key, 'to', n.value)), '{}'::jsonb)
  from jsonb_each(new_row) n
  where n.key not in ('updated_at', 'created_at', 'extraction', 'workspace_id', 'id', 'idle_people')
    and (old_row -> n.key) is distinct from n.value
    and length(coalesce((old_row -> n.key)::text, '')) <= 500
    and length(n.value::text) <= 500;
$$;

-- Generic row trigger. TG_ARGV[0] = target type, TG_ARGV[1] = column used as the label.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  kind text := tg_argv[0];
  label_col text := tg_argv[1];
  ws uuid := (rec ->> 'workspace_id')::uuid;
  verb text;
  changes jsonb := '{}'::jsonb;
  target text := coalesce(rec ->> 'id', rec ->> 'user_id');
begin
  if kind = 'workspace' then
    ws := (rec ->> 'id')::uuid;
  end if;
  if tg_op = 'INSERT' then
    verb := case kind when 'invite' then 'sent' when 'member' then 'joined' else 'created' end;
  elsif tg_op = 'DELETE' then
    verb := case kind when 'invite' then 'cancelled' when 'member' then 'removed' else 'deleted' end;
    -- An invite disappears when it's accepted, too.
    if kind = 'invite' and exists (
      select 1 from public.workspace_members m where m.workspace_id = ws and m.email = rec ->> 'email') then
      verb := 'accepted';
    end if;
  else
    changes := public.audit_changes(to_jsonb(old), to_jsonb(new));
    if changes = '{}'::jsonb then
      return null;
    end if;
    verb := case
      when kind = 'member' and changes ? 'role' then 'role_changed'
      when kind = 'sso' and changes ? 'status' then 'status_changed'
      else 'updated' end;
  end if;

  -- When a whole workspace is deleted its log goes with it, so there's nothing to write.
  if not exists (select 1 from public.workspaces w where w.id = ws) then
    return null;
  end if;

  insert into public.audit_log (workspace_id, actor_id, actor_email, action, target_type, target_id, target_label, details)
  values (
    ws, auth.uid(), public.audit_actor_email(), kind || '.' || verb, kind, target, left(rec ->> label_col, 200),
    case
      when tg_op = 'UPDATE' then jsonb_build_object('changes', changes)
      when kind in ('member', 'invite') then jsonb_strip_nulls(jsonb_build_object('role', rec ->> 'role', 'department_id', rec ->> 'department_id'))
      when kind = 'contract' then jsonb_strip_nulls(jsonb_build_object('file', rec ->> 'file_name', 'annual_fee', rec -> 'annual_fee', 'term_end', rec ->> 'term_end'))
      else '{}'::jsonb
    end
  );
  return null;
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

drop trigger if exists audit_contracts on public.contracts;
create trigger audit_contracts after insert or update or delete on public.contracts
  for each row execute function public.audit_row_change('contract', 'vendor');
drop trigger if exists audit_members on public.workspace_members;
create trigger audit_members after insert or update or delete on public.workspace_members
  for each row execute function public.audit_row_change('member', 'email');
drop trigger if exists audit_invites on public.workspace_invites;
create trigger audit_invites after insert or delete on public.workspace_invites
  for each row execute function public.audit_row_change('invite', 'email');
drop trigger if exists audit_departments on public.departments;
create trigger audit_departments after insert or update or delete on public.departments
  for each row execute function public.audit_row_change('department', 'name');
drop trigger if exists audit_tools on public.tools;
create trigger audit_tools after insert or update or delete on public.tools
  for each row execute function public.audit_row_change('tool', 'name');
drop trigger if exists audit_workspaces on public.workspaces;
create trigger audit_workspaces after update on public.workspaces
  for each row execute function public.audit_row_change('workspace', 'name');
drop trigger if exists audit_connections on public.connections;
create trigger audit_connections after insert or delete on public.connections
  for each row execute function public.audit_row_change('connection', 'provider');

-- ===========================================================================
-- 2. Entities (brands, subsidiaries, regions) and cost centres
-- The workspace is the parent organisation. Each entity has its own currency.
-- ===========================================================================

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  code text check (code is null or char_length(code) <= 20),          -- e.g. FD, PP, SBG
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists entities_ws_name_idx on public.entities (workspace_id, lower(name));

create table if not exists public.cost_centres (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  entity_id uuid not null references public.entities (id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 30),
  name text check (name is null or char_length(name) <= 80),
  created_at timestamptz not null default now()
);
create unique index if not exists cost_centres_entity_code_idx on public.cost_centres (entity_id, lower(code));

alter table public.contracts
  add column if not exists entity_id uuid references public.entities (id) on delete set null,
  add column if not exists cost_centre_id uuid references public.cost_centres (id) on delete set null;
alter table public.tools
  add column if not exists entity_id uuid references public.entities (id) on delete set null,
  add column if not exists cost_centre_id uuid references public.cost_centres (id) on delete set null;
create index if not exists contracts_entity_idx on public.contracts (entity_id);

-- A cost centre must belong to the same workspace (and to the chosen entity, when there is one).
create or replace function public.check_entity_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cc_entity uuid;
begin
  if new.entity_id is not null and not exists (
    select 1 from public.entities e where e.id = new.entity_id and e.workspace_id = new.workspace_id) then
    raise exception 'That entity is not in this workspace.';
  end if;
  if new.cost_centre_id is not null then
    select c.entity_id into cc_entity from public.cost_centres c
    where c.id = new.cost_centre_id and c.workspace_id = new.workspace_id;
    if cc_entity is null then
      raise exception 'That cost centre is not in this workspace.';
    end if;
    if new.entity_id is null then
      new.entity_id := cc_entity;
    elsif new.entity_id <> cc_entity then
      raise exception 'That cost centre belongs to a different entity.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_entity_refs on public.contracts;
create trigger contracts_entity_refs before insert or update of entity_id, cost_centre_id on public.contracts
  for each row execute function public.check_entity_refs();
drop trigger if exists tools_entity_refs on public.tools;
create trigger tools_entity_refs before insert or update of entity_id, cost_centre_id on public.tools
  for each row execute function public.check_entity_refs();

create or replace function public.check_cost_centre_entity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.entities e where e.id = new.entity_id and e.workspace_id = new.workspace_id) then
    raise exception 'That entity is not in this workspace.';
  end if;
  return new;
end;
$$;
drop trigger if exists cost_centres_entity_ws on public.cost_centres;
create trigger cost_centres_entity_ws before insert or update on public.cost_centres
  for each row execute function public.check_cost_centre_entity();

alter table public.entities enable row level security;
alter table public.cost_centres enable row level security;

drop policy if exists "members read entities" on public.entities;
create policy "members read entities" on public.entities
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "admins manage entities" on public.entities;
create policy "admins manage entities" on public.entities
  for all to authenticated
  using ((select public.is_workspace_owner(workspace_id))) with check ((select public.is_workspace_owner(workspace_id)));

drop policy if exists "members read cost centres" on public.cost_centres;
create policy "members read cost centres" on public.cost_centres
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "admins manage cost centres" on public.cost_centres;
create policy "admins manage cost centres" on public.cost_centres
  for all to authenticated
  using ((select public.is_workspace_owner(workspace_id))) with check ((select public.is_workspace_owner(workspace_id)));

grant select, insert, update, delete on public.entities to authenticated;
grant select, insert, update, delete on public.cost_centres to authenticated;

drop trigger if exists audit_entities on public.entities;
create trigger audit_entities after insert or update or delete on public.entities
  for each row execute function public.audit_row_change('entity', 'name');
drop trigger if exists audit_cost_centres on public.cost_centres;
create trigger audit_cost_centres after insert or update or delete on public.cost_centres
  for each row execute function public.audit_row_change('cost_centre', 'code');

-- ===========================================================================
-- 3. SAML single sign-on
-- A workspace admin requests SSO for their email domain and gives the identity provider's
-- metadata URL. The platform operator checks the domain belongs to that customer and turns it
-- on with `npm run sso:activate`, which registers the provider in Supabase Auth and sets
-- status = 'active' and provider_id. Admins can't set those two columns themselves.
-- ===========================================================================

create table if not exists public.workspace_sso (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  domain text not null unique check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  metadata_url text check (metadata_url is null or metadata_url ~ '^https://'),
  status text not null default 'requested' check (status in ('requested', 'active', 'disabled')),
  provider_id text,                    -- Supabase Auth SSO provider id, set on activation
  enforce boolean not null default false,  -- once active: people at this domain must sign in with SSO
  default_role text not null default 'member' check (default_role in ('approver', 'viewer', 'member')),
  requested_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create index if not exists workspace_sso_ws_idx on public.workspace_sso (workspace_id);

alter table public.workspace_sso enable row level security;
drop policy if exists "admins read sso" on public.workspace_sso;
create policy "admins read sso" on public.workspace_sso
  for select to authenticated using ((select public.is_workspace_owner(workspace_id)));
drop policy if exists "admins request sso" on public.workspace_sso;
create policy "admins request sso" on public.workspace_sso
  for insert to authenticated
  with check ((select public.is_workspace_owner(workspace_id)) and status = 'requested' and provider_id is null);
drop policy if exists "admins change sso" on public.workspace_sso;
create policy "admins change sso" on public.workspace_sso
  for update to authenticated
  using ((select public.is_workspace_owner(workspace_id))) with check ((select public.is_workspace_owner(workspace_id)));
drop policy if exists "admins remove sso" on public.workspace_sso;
create policy "admins remove sso" on public.workspace_sso
  for delete to authenticated using ((select public.is_workspace_owner(workspace_id)));

grant select, delete on public.workspace_sso to authenticated;
grant insert (workspace_id, domain, metadata_url, enforce, default_role) on public.workspace_sso to authenticated;
grant update (metadata_url, enforce, default_role) on public.workspace_sso to authenticated;

drop trigger if exists audit_sso on public.workspace_sso;
create trigger audit_sso after insert or update or delete on public.workspace_sso
  for each row execute function public.audit_row_change('sso', 'domain');

-- Used by the sign-in page before it tries a password: must this email use SSO? Says nothing else.
create or replace function public.sso_required(email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_sso s
    where s.status = 'active' and s.enforce and s.domain = lower(split_part(email, '@', 2))
  );
$$;
revoke all on function public.sso_required(text) from public;
grant execute on function public.sso_required(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bootstrap_workspace: people who sign in through their company's SSO join that
-- workspace automatically (just-in-time provisioning) with the configured default role.
-- ---------------------------------------------------------------------------

create or replace function public.bootstrap_workspace()
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  sso_user boolean;
  ws public.workspaces;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select lower(u.email), coalesce(u.is_sso_user, false) into user_email, sso_user from auth.users u where u.id = uid;

  insert into public.workspace_members as m (workspace_id, user_id, email, role, department_id)
  select i.workspace_id, uid, user_email, i.role, i.department_id
  from public.workspace_invites i
  where i.email = user_email
  on conflict (workspace_id, user_id) do update
    set department_id = coalesce(excluded.department_id, m.department_id),
        role = case when public.role_rank(excluded.role) > public.role_rank(m.role) then excluded.role else m.role end;
  delete from public.workspace_invites i where i.email = user_email;

  if sso_user then
    insert into public.workspace_members (workspace_id, user_id, email, role)
    select s.workspace_id, uid, user_email, s.default_role
    from public.workspace_sso s
    where s.status = 'active' and s.domain = split_part(user_email, '@', 2)
    on conflict do nothing;
  end if;

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
