-- Contract Radar: user roles for enterprise teams. Builds on 20261115120000_team_onboarding.sql.
-- Safe to re-run in the Supabase SQL editor.
--
-- workspace_members.role and workspace_invites.role now take four values:
--   owner    = Admin. Manages the team, billing, sources and settings. (unchanged)
--   approver = Finance approver. Sees everything, approves renewal decisions, gets every renewal reminder.
--   viewer   = Read only. Sees the workspace but can't upload, edit, invite or answer surveys.
--   member   = Department owner. Manages their own department's tools and surveys. (unchanged)
-- Existing rows keep their meaning, so nothing changes for current users.

-- ---------------------------------------------------------------------------
-- Allowed values
-- ---------------------------------------------------------------------------

alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check check (role in ('owner', 'approver', 'viewer', 'member'));

alter table public.workspace_invites drop constraint if exists workspace_invites_role_check;
alter table public.workspace_invites
  add constraint workspace_invites_role_check check (role in ('owner', 'approver', 'viewer', 'member'));

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------

-- The caller's role in a workspace, or null when they aren't a member.
create or replace function public.workspace_role(ws uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.workspace_members m
  where m.workspace_id = ws and m.user_id = (select auth.uid());
$$;

-- Member who may change data (everyone except viewers).
create or replace function public.can_write(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.workspace_role(ws)) in ('owner', 'approver', 'member'), false);
$$;

-- Who signs off renewal decisions (used by the renewal approval workflow).
create or replace function public.can_approve_renewals(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.workspace_role(ws)) in ('owner', 'approver'), false);
$$;

-- Higher number wins when an invite meets an existing membership.
create or replace function public.role_rank(r text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case r when 'owner' then 4 when 'approver' then 3 when 'member' then 2 when 'viewer' then 1 else 0 end;
$$;

revoke all on function public.workspace_role(uuid) from public, anon;
grant execute on function public.workspace_role(uuid) to authenticated;
revoke all on function public.can_write(uuid) from public, anon;
grant execute on function public.can_write(uuid) to authenticated;
revoke all on function public.can_approve_renewals(uuid) from public, anon;
grant execute on function public.can_approve_renewals(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- bootstrap_workspace: an invite can raise someone's role (never lower it).
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
        role = case when public.role_rank(excluded.role) > public.role_rank(m.role) then excluded.role else m.role end;
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
-- Invites: only admins invite admins or approvers; viewers can't invite.
-- ---------------------------------------------------------------------------

drop policy if exists "invite rules" on public.workspace_invites;
create policy "invite rules" on public.workspace_invites
  as restrictive for insert to authenticated
  with check (
    (select public.can_write(workspace_id))
    and (role in ('member', 'viewer') or (select public.is_workspace_owner(workspace_id)))
    and (
      (select public.is_workspace_owner(workspace_id))
      or department_id is null
      or department_id = (select public.my_department(workspace_id))
    )
    and (department_id is null or exists (
      select 1 from public.departments d where d.id = department_id and d.workspace_id = workspace_invites.workspace_id))
  );

-- ---------------------------------------------------------------------------
-- Viewers are read only. Restrictive policies are ANDed with the existing ones,
-- so every other rule stays exactly as it was.
-- ---------------------------------------------------------------------------

drop policy if exists "viewers read only" on public.workspaces;
create policy "viewers read only" on public.workspaces
  as restrictive for update to authenticated
  using ((select public.can_write(id))) with check ((select public.can_write(id)));

drop policy if exists "viewers cancel no invites" on public.workspace_invites;
create policy "viewers cancel no invites" on public.workspace_invites
  as restrictive for delete to authenticated using ((select public.can_write(workspace_id)));

drop policy if exists "viewers add no contracts" on public.contracts;
create policy "viewers add no contracts" on public.contracts
  as restrictive for insert to authenticated with check ((select public.can_write(workspace_id)));
drop policy if exists "viewers edit no contracts" on public.contracts;
create policy "viewers edit no contracts" on public.contracts
  as restrictive for update to authenticated
  using ((select public.can_write(workspace_id))) with check ((select public.can_write(workspace_id)));
drop policy if exists "viewers delete no contracts" on public.contracts;
create policy "viewers delete no contracts" on public.contracts
  as restrictive for delete to authenticated using ((select public.can_write(workspace_id)));

drop policy if exists "viewers add no tools" on public.tools;
create policy "viewers add no tools" on public.tools
  as restrictive for insert to authenticated with check ((select public.can_write(workspace_id)));
drop policy if exists "viewers edit no tools" on public.tools;
create policy "viewers edit no tools" on public.tools
  as restrictive for update to authenticated
  using ((select public.can_write(workspace_id))) with check ((select public.can_write(workspace_id)));
drop policy if exists "viewers delete no tools" on public.tools;
create policy "viewers delete no tools" on public.tools
  as restrictive for delete to authenticated using ((select public.can_write(workspace_id)));

drop policy if exists "viewers answer no surveys" on public.tool_surveys;
create policy "viewers answer no surveys" on public.tool_surveys
  as restrictive for insert to authenticated with check ((select public.can_write(workspace_id)));

-- Contract PDFs: viewers can open them but not upload or delete.
drop policy if exists "viewers upload no contract files" on storage.objects;
create policy "viewers upload no contract files" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'contracts' or (select public.can_write(((storage.foldername(name))[1])::uuid)));
drop policy if exists "viewers delete no contract files" on storage.objects;
create policy "viewers delete no contract files" on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'contracts' or (select public.can_write(((storage.foldername(name))[1])::uuid)));
