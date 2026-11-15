-- Contract Radar: team onboarding. Departments, department owners, role-aware invites,
-- the tool inventory and the 4-question tool survey. Builds on 20261115000000.
-- Safe to re-run in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Workspace setup fields
-- ---------------------------------------------------------------------------

alter table public.workspaces
  add column if not exists company_size text,
  add column if not exists onboarded_at timestamptz;

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index if not exists departments_ws_name_idx on public.departments (workspace_id, lower(name));

-- Members belong to at most one department. role 'owner' = admin / C-level, 'member' = department owner.
alter table public.workspace_members
  add column if not exists department_id uuid references public.departments (id) on delete set null,
  add column if not exists job_title text check (job_title is null or char_length(job_title) <= 80);

alter table public.workspace_invites
  add column if not exists department_id uuid references public.departments (id) on delete set null,
  add column if not exists role text not null default 'member' check (role in ('owner', 'member'));

-- ---------------------------------------------------------------------------
-- Tool inventory and survey
-- ---------------------------------------------------------------------------

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  contract_id uuid unique references public.contracts (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'Other' check (char_length(category) <= 60),
  description text check (description is null or char_length(description) <= 1000),
  annual_cost numeric check (annual_cost is null or annual_cost >= 0),
  seats int check (seats is null or seats >= 0),
  renewal_date date,
  source text not null default 'manual' check (source in ('manual', 'upload', 'import')),
  confirmed boolean not null default true,  -- false = suggested from an upload, waiting for the department to confirm
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tools_workspace_idx on public.tools (workspace_id, department_id);

-- Every answer is kept (the survey is re-sent before each renewal); the latest one counts.
create table if not exists public.tool_surveys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  tool_id uuid not null references public.tools (id) on delete cascade,
  respondent_id uuid references auth.users (id) on delete set null default auth.uid(),
  respondent_email text,
  purpose text not null check (char_length(btrim(purpose)) between 1 and 1000),
  criticality int not null check (criticality between 1 and 5),
  replacement text check (replacement is null or char_length(replacement) <= 300),
  no_replacement_needed boolean not null default false,
  seats_needed text not null check (seats_needed in ('all', 'some', 'unsure')),
  seats_needed_count int check (seats_needed_count is null or seats_needed_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists tool_surveys_tool_idx on public.tool_surveys (tool_id, created_at desc);
create index if not exists tool_surveys_workspace_idx on public.tool_surveys (workspace_id);

-- The caller's department in a workspace (security invoker: it reads through RLS).
create or replace function public.my_department(ws uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select m.department_id from public.workspace_members m
  where m.workspace_id = ws and m.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- bootstrap_workspace: invites now carry a role and a department.
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
  ws public.workspaces;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select lower(u.email) into user_email from auth.users u where u.id = uid;

  insert into public.workspace_members as m (workspace_id, user_id, email, role, department_id)
  select i.workspace_id, uid, user_email, i.role, i.department_id
  from public.workspace_invites i
  where i.email = user_email
  on conflict (workspace_id, user_id) do update
    set department_id = coalesce(excluded.department_id, m.department_id),
        role = case when excluded.role = 'owner' then 'owner' else m.role end;
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

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.departments enable row level security;
alter table public.tools enable row level security;
alter table public.tool_surveys enable row level security;

-- Departments: everyone in the workspace reads them, admins manage them.
drop policy if exists "members read departments" on public.departments;
create policy "members read departments" on public.departments
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "admins add departments" on public.departments;
create policy "admins add departments" on public.departments
  for insert to authenticated with check ((select public.is_workspace_owner(workspace_id)));
drop policy if exists "admins rename departments" on public.departments;
create policy "admins rename departments" on public.departments
  for update to authenticated
  using ((select public.is_workspace_owner(workspace_id))) with check ((select public.is_workspace_owner(workspace_id)));
drop policy if exists "admins delete departments" on public.departments;
create policy "admins delete departments" on public.departments
  for delete to authenticated using ((select public.is_workspace_owner(workspace_id)));

-- Members: admins set people's department and role, but can't demote themselves.
drop policy if exists "admins update members" on public.workspace_members;
create policy "admins update members" on public.workspace_members
  for update to authenticated
  using ((select public.is_workspace_owner(workspace_id)))
  with check (
    (select public.is_workspace_owner(workspace_id))
    and (user_id <> (select auth.uid()) or role = 'owner')
    and (department_id is null or exists (
      select 1 from public.departments d where d.id = department_id and d.workspace_id = workspace_members.workspace_id))
  );

-- Invites: only admins invite admins; department owners invite into their own department.
drop policy if exists "invite rules" on public.workspace_invites;
create policy "invite rules" on public.workspace_invites
  as restrictive for insert to authenticated
  with check (
    (role = 'member' or (select public.is_workspace_owner(workspace_id)))
    and (
      (select public.is_workspace_owner(workspace_id))
      or department_id is null
      or department_id = (select public.my_department(workspace_id))
    )
    and (department_id is null or exists (
      select 1 from public.departments d where d.id = department_id and d.workspace_id = workspace_invites.workspace_id))
  );

-- Tools: everyone reads; admins edit any, department owners edit their own department's
-- tools and unassigned ones (to claim them).
drop policy if exists "members read tools" on public.tools;
create policy "members read tools" on public.tools
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "members add tools" on public.tools;
create policy "members add tools" on public.tools
  for insert to authenticated
  with check (
    (select public.is_workspace_member(workspace_id))
    and (
      (select public.is_workspace_owner(workspace_id))
      or department_id is null
      or department_id = (select public.my_department(workspace_id))
    )
    and (department_id is null or exists (
      select 1 from public.departments d where d.id = department_id and d.workspace_id = tools.workspace_id))
    and (contract_id is null or exists (
      select 1 from public.contracts c where c.id = contract_id and c.workspace_id = tools.workspace_id))
  );
drop policy if exists "members update tools" on public.tools;
create policy "members update tools" on public.tools
  for update to authenticated
  using (
    (select public.is_workspace_owner(workspace_id))
    or ((select public.is_workspace_member(workspace_id))
        and (department_id is null or department_id = (select public.my_department(workspace_id))))
  )
  with check (
    (select public.is_workspace_member(workspace_id))
    and (
      (select public.is_workspace_owner(workspace_id))
      or department_id is null
      or department_id = (select public.my_department(workspace_id))
    )
    and (department_id is null or exists (
      select 1 from public.departments d where d.id = department_id and d.workspace_id = tools.workspace_id))
    and (contract_id is null or exists (
      select 1 from public.contracts c where c.id = contract_id and c.workspace_id = tools.workspace_id))
  );
drop policy if exists "admins or creators delete tools" on public.tools;
create policy "admins or creators delete tools" on public.tools
  for delete to authenticated
  using (
    (select public.is_workspace_owner(workspace_id))
    or ((select public.is_workspace_member(workspace_id)) and created_by = (select auth.uid()))
  );

-- Surveys: everyone reads; you answer for tools you're allowed to edit, as yourself.
drop policy if exists "members read surveys" on public.tool_surveys;
create policy "members read surveys" on public.tool_surveys
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "members answer surveys" on public.tool_surveys;
create policy "members answer surveys" on public.tool_surveys
  for insert to authenticated
  with check (
    respondent_id = (select auth.uid())
    and (select public.is_workspace_member(workspace_id))
    and exists (
      select 1 from public.tools t
      where t.id = tool_id and t.workspace_id = tool_surveys.workspace_id
        and (
          (select public.is_workspace_owner(t.workspace_id))
          or t.department_id is null
          or t.department_id = (select public.my_department(t.workspace_id))
        )
    )
  );

grant select, insert, update, delete on public.departments to authenticated;
grant update (department_id, role, job_title) on public.workspace_members to authenticated;
grant select, insert, update, delete on public.tools to authenticated;
grant select, insert on public.tool_surveys to authenticated;
