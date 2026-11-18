-- Two-step sign-in (TOTP authenticator apps, Supabase Auth MFA). Safe to run more than once.
--
-- Once someone has turned on two-step sign-in, a session that hasn't passed the 6-digit code yet
-- (aal1) can't read or change any workspace data, even by calling the Supabase API directly.
-- People who haven't turned it on are unaffected.

-- True when this request may see data: the session passed two-step sign-in, or the person hasn't turned it on.
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;
revoke execute on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated, service_role;

-- A restrictive policy on every public table that signed-in users can reach, and on contract files.
do $$
declare r record;
begin
  for r in
    select distinct p.tablename
    from pg_policies p
    where p.schemaname = 'public' and 'authenticated' = any (p.roles) and p.permissive = 'PERMISSIVE'
  loop
    execute format('drop policy if exists "two-step sign-in when turned on" on public.%I', r.tablename);
    execute format(
      'create policy "two-step sign-in when turned on" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      r.tablename);
  end loop;
end $$;

drop policy if exists "two-step sign-in when turned on" on storage.objects;
create policy "two-step sign-in when turned on" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'contracts' or (select public.mfa_ok()))
  with check (bucket_id <> 'contracts' or (select public.mfa_ok()));

-- Functions that run with elevated rights skip row-level security, so they get the same check at the top.
do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array[
    'public.submit_renewal_recommendation(uuid,text,text,text,integer,text,numeric)',
    'public.decide_renewal_review(uuid,text,text)',
    'public.reopen_renewal_review(uuid,text)',
    'public.log_audit(uuid,text,text,text,text,jsonb)']
  loop
    if to_regprocedure(fn) is null then continue; end if;
    def := pg_get_functiondef(to_regprocedure(fn));
    if position('mfa_ok' in def) > 0 then continue; end if;
    def := regexp_replace(def, E'\\nbegin\\n',
      E'\nbegin\n  if not public.mfa_ok() then raise exception ''enter your two-step sign-in code first''; end if;\n');
    execute def;
  end loop;
end $$;
