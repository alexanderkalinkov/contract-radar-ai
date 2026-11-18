-- Security hardening (audit of 2026-11-18). Safe to run more than once.
--
-- 1. SSO: workspace admins could switch their own SSO request to "active" for any email domain
--    (gmail.com, a competitor's domain …). That locked every person on that domain out of password
--    sign-in and pulled SSO users of that domain into the admin's workspace. Supabase's default
--    table-wide UPDATE grant made the column-level grants in the SSO migration a no-op.
--    Now only the server (service role) can change status, provider_id or domain.
-- 2. Same default grant on workspaces and workspace_members: limit what the app's users can change
--    to the columns the app actually edits (no rewriting created_by, user_id, email, workspace_id …).
-- 3. Signed-out visitors (anon) get no table access at all, and nobody gets TRUNCATE / TRIGGER /
--    REFERENCES (TRUNCATE ignores row-level security).
-- 4. new_inbox_token() is server-only.
-- 5. A small rate-limit table the server uses for sign-in attempts, uploads and AI calls.

-- 1. SSO -----------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.workspace_sso') is not null then
    revoke insert, update on public.workspace_sso from authenticated, anon;
    grant insert (workspace_id, domain, metadata_url, enforce, default_role) on public.workspace_sso to authenticated;
    grant update (metadata_url, enforce, default_role) on public.workspace_sso to authenticated;

    -- Belt and braces: even with a stray grant, a signed-in user's update can't touch status/provider/domain.
    create or replace function public.protect_sso_fields() returns trigger
    language plpgsql set search_path = '' as $f$
    begin
      if (current_user in ('authenticated', 'anon') or coalesce(auth.role(), '') in ('authenticated', 'anon')) and (
           new.status is distinct from old.status
        or new.provider_id is distinct from old.provider_id
        or new.domain is distinct from old.domain
        or new.workspace_id is distinct from old.workspace_id) then
        raise exception 'only Contract Radar support can change an SSO connection''s status, provider or domain';
      end if;
      return new;
    end $f$;
    drop trigger if exists protect_sso_fields on public.workspace_sso;
    create trigger protect_sso_fields before update on public.workspace_sso
      for each row execute function public.protect_sso_fields();
  end if;
end $$;

-- 2. Column-level write access ------------------------------------------------------------------
revoke update on public.workspaces from authenticated, anon;
grant update (name, show_sample_data, company_size, onboarded_at, renewal_alerts) on public.workspaces to authenticated;

revoke insert, update on public.workspace_members from authenticated, anon;
grant update (role, department_id, job_title) on public.workspace_members to authenticated;

-- Written only by the server or by SECURITY DEFINER functions: users never insert/update these directly.
do $$
declare t text;
begin
  foreach t in array array['workspace_billing', 'audit_log', 'renewal_alerts', 'inbound_emails', 'import_jobs', 'import_items',
                           'renewal_reviews', 'renewal_review_events', 'connection_secrets']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update on public.%I from anon', t);
    end if;
  end loop;
  foreach t in array array['workspace_billing', 'audit_log', 'renewal_alerts', 'inbound_emails', 'import_jobs', 'import_items']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

-- 3. No anon table access, no TRUNCATE/TRIGGER/REFERENCES for API roles ----------------------------
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
  loop
    execute format('revoke all on public.%I from anon', r.relname);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', r.relname);
  end loop;
end $$;
-- …and for tables made later.
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- 4. Functions ------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.new_inbox_token()') is not null then
    revoke execute on function public.new_inbox_token() from public, anon, authenticated;
    grant execute on function public.new_inbox_token() to service_role;
  end if;
end $$;

-- 5. Rate limits ----------------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one hit for key in the current fixed window; true while the count is within the limit.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (left(p_key, 200), w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  -- Tidy up old windows now and then.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_limit;
end $$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant select, insert, update, delete on public.rate_limits to service_role;
