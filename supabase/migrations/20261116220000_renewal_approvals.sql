-- Contract Radar: renewal approval workflow.
-- Before each renewal the department owner recommends keep, cut seats, consolidate, renegotiate or cancel, with a
-- reason. An approver (workspace admin, or a Finance approver once the roles migration adds that role) approves it
-- or sends it back with a note. Every step is written to renewal_review_events, which nobody can edit or delete.
--
-- All writes go through the three functions below, which check who is allowed to do what, so the tables
-- themselves are read-only for signed-in users. Run the whole file once in the Supabase SQL editor; safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.renewal_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  cycle text not null check (cycle = 'open' or cycle ~ '^\d{4}-\d{2}-\d{2}$'),  -- the term end this renewal follows
  recommendation text not null check (recommendation in ('keep', 'cut_seats', 'consolidate', 'renegotiate', 'cancel')),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  target_seats int check (target_seats is null or target_seats >= 0),
  consolidate_into text check (consolidate_into is null or char_length(consolidate_into) <= 120),
  expected_savings numeric check (expected_savings is null or expected_savings >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  recommended_by uuid references auth.users (id) on delete set null,
  recommended_by_email text,
  recommended_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_by_email text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, cycle)
);
create index if not exists renewal_reviews_workspace_idx on public.renewal_reviews (workspace_id, status);

-- Append-only history: one row per recommendation, revision, approval, rejection or reopen.
create table if not exists public.renewal_review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.renewal_reviews (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  action text not null check (action in ('recommended', 'revised', 'approved', 'rejected', 'reopened')),
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  recommendation text,
  expected_savings numeric,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists renewal_review_events_review_idx on public.renewal_review_events (review_id, created_at);
create index if not exists renewal_review_events_workspace_idx on public.renewal_review_events (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Who can approve. Admins today; the roles migration adds 'approver'. Keep in step with
-- canApproveRenewals() in src/lib/approvals.ts.
-- ---------------------------------------------------------------------------

create or replace function public.can_approve_renewals(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role in ('owner', 'approver')
  );
$$;
revoke all on function public.can_approve_renewals(uuid) from public, anon;
grant execute on function public.can_approve_renewals(uuid) to authenticated;

-- Writes to the audit log when the roles/audit migration has added public.log_audit; does nothing before that.
create or replace function public.renewal_review_audit(ws uuid, act text, review uuid, label text, details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('public.log_audit(uuid,text,text,text,text,jsonb)') is not null then
    execute 'select public.log_audit($1, $2, $3, $4, $5, $6)' using ws, act, 'renewal_review', review::text, label, details;
  end if;
exception when others then
  null; -- the approval itself must not fail because of the audit log
end;
$$;
revoke all on function public.renewal_review_audit(uuid, text, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recommend (or revise a recommendation that is waiting or was sent back).
-- Allowed: admins and approvers, and members who own the department of the tool linked to the contract
-- (anyone in the workspace when no department is linked). Read-only viewers can't.
-- ---------------------------------------------------------------------------

create or replace function public.submit_renewal_recommendation(
  p_contract uuid,
  p_cycle text,
  p_recommendation text,
  p_reason text,
  p_target_seats int default null,
  p_consolidate_into text default null,
  p_expected_savings numeric default null
)
returns public.renewal_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ws uuid;
  vendor_name text;
  me public.workspace_members;
  dept uuid;
  existing public.renewal_reviews;
  result public.renewal_reviews;
  act text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select c.workspace_id, c.vendor into ws, vendor_name from public.contracts c where c.id = p_contract;
  if ws is null then raise exception 'contract not found'; end if;
  select * into me from public.workspace_members m where m.workspace_id = ws and m.user_id = uid;
  if me.user_id is null then raise exception 'not a member of this workspace'; end if;
  if me.role = 'viewer' then raise exception 'viewers can''t recommend renewals'; end if;
  if me.role not in ('owner', 'approver') then
    select t.department_id into dept from public.tools t where t.contract_id = p_contract;
    if dept is not null and dept is distinct from me.department_id then
      raise exception 'only the department that owns this tool, or an approver, can recommend';
    end if;
  end if;

  select * into existing from public.renewal_reviews r where r.contract_id = p_contract and r.cycle = p_cycle for update;
  if existing.id is not null and existing.status = 'approved' then
    raise exception 'this renewal is already approved; an approver has to reopen it first';
  end if;

  if existing.id is null then
    insert into public.renewal_reviews (workspace_id, contract_id, cycle, recommendation, reason, target_seats,
      consolidate_into, expected_savings, status, recommended_by, recommended_by_email)
    values (ws, p_contract, p_cycle, p_recommendation, btrim(p_reason), p_target_seats,
      nullif(btrim(coalesce(p_consolidate_into, '')), ''), p_expected_savings, 'pending', uid, me.email)
    returning * into result;
    act := 'recommended';
  else
    update public.renewal_reviews r set
      recommendation = p_recommendation,
      reason = btrim(p_reason),
      target_seats = p_target_seats,
      consolidate_into = nullif(btrim(coalesce(p_consolidate_into, '')), ''),
      expected_savings = p_expected_savings,
      status = 'pending',
      recommended_by = uid,
      recommended_by_email = me.email,
      recommended_at = now(),
      decided_by = null,
      decided_by_email = null,
      decided_at = null,
      decision_note = null,
      updated_at = now()
    where r.id = existing.id
    returning * into result;
    act := 'revised';
  end if;

  insert into public.renewal_review_events (review_id, workspace_id, contract_id, action, actor_id, actor_email, recommendation, expected_savings, note)
  values (result.id, ws, p_contract, act, uid, me.email, result.recommendation, result.expected_savings, result.reason);
  perform public.renewal_review_audit(ws, 'renewal.' || act, result.id, vendor_name,
    jsonb_build_object('recommendation', result.recommendation, 'expected_savings', result.expected_savings, 'cycle', result.cycle));
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approve or send back. Approvers only; sending back needs a note.
-- ---------------------------------------------------------------------------

create or replace function public.decide_renewal_review(p_review uuid, p_decision text, p_note text default null)
returns public.renewal_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.renewal_reviews;
  result public.renewal_reviews;
  my_email text;
  vendor_name text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'decision must be approved or rejected'; end if;
  select * into existing from public.renewal_reviews r where r.id = p_review for update;
  if existing.id is null then raise exception 'review not found'; end if;
  if not public.can_approve_renewals(existing.workspace_id) then raise exception 'only approvers can approve renewals'; end if;
  if existing.status <> 'pending' then raise exception 'this recommendation is not waiting for approval'; end if;
  if p_decision = 'rejected' and char_length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'say why when you send a recommendation back';
  end if;
  select m.email into my_email from public.workspace_members m where m.workspace_id = existing.workspace_id and m.user_id = uid;
  select c.vendor into vendor_name from public.contracts c where c.id = existing.contract_id;

  update public.renewal_reviews r set
    status = p_decision,
    decided_by = uid,
    decided_by_email = my_email,
    decided_at = now(),
    decision_note = nullif(btrim(coalesce(p_note, '')), ''),
    updated_at = now()
  where r.id = p_review
  returning * into result;

  insert into public.renewal_review_events (review_id, workspace_id, contract_id, action, actor_id, actor_email, recommendation, expected_savings, note)
  values (result.id, result.workspace_id, result.contract_id, p_decision, uid, my_email, result.recommendation, result.expected_savings, result.decision_note);
  perform public.renewal_review_audit(result.workspace_id, 'renewal.' || p_decision, result.id, vendor_name,
    jsonb_build_object('recommendation', result.recommendation, 'expected_savings', result.expected_savings, 'note', result.decision_note,
      'recommended_by', result.recommended_by_email, 'cycle', result.cycle));
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reopen a decided recommendation (for example, the vendor came back with a new offer). Approvers only.
-- ---------------------------------------------------------------------------

create or replace function public.reopen_renewal_review(p_review uuid, p_note text default null)
returns public.renewal_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.renewal_reviews;
  result public.renewal_reviews;
  my_email text;
  vendor_name text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into existing from public.renewal_reviews r where r.id = p_review for update;
  if existing.id is null then raise exception 'review not found'; end if;
  if not public.can_approve_renewals(existing.workspace_id) then raise exception 'only approvers can reopen a decision'; end if;
  if existing.status = 'pending' then raise exception 'this recommendation is already waiting for approval'; end if;
  select m.email into my_email from public.workspace_members m where m.workspace_id = existing.workspace_id and m.user_id = uid;
  select c.vendor into vendor_name from public.contracts c where c.id = existing.contract_id;

  update public.renewal_reviews r set
    status = 'pending', decided_by = null, decided_by_email = null, decided_at = null, decision_note = null, updated_at = now()
  where r.id = p_review
  returning * into result;

  insert into public.renewal_review_events (review_id, workspace_id, contract_id, action, actor_id, actor_email, recommendation, expected_savings, note)
  values (result.id, result.workspace_id, result.contract_id, 'reopened', uid, my_email, result.recommendation, result.expected_savings,
    nullif(btrim(coalesce(p_note, '')), ''));
  perform public.renewal_review_audit(result.workspace_id, 'renewal.reopened', result.id, vendor_name,
    jsonb_build_object('previous_status', existing.status, 'note', p_note, 'cycle', result.cycle));
  return result;
end;
$$;

revoke all on function public.submit_renewal_recommendation(uuid, text, text, text, int, text, numeric) from public, anon;
grant execute on function public.submit_renewal_recommendation(uuid, text, text, text, int, text, numeric) to authenticated;
revoke all on function public.decide_renewal_review(uuid, text, text) from public, anon;
grant execute on function public.decide_renewal_review(uuid, text, text) to authenticated;
revoke all on function public.reopen_renewal_review(uuid, text) from public, anon;
grant execute on function public.reopen_renewal_review(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: members read; nobody writes directly (the functions above do it).
-- ---------------------------------------------------------------------------

alter table public.renewal_reviews enable row level security;
alter table public.renewal_review_events enable row level security;

drop policy if exists "members read renewal reviews" on public.renewal_reviews;
create policy "members read renewal reviews" on public.renewal_reviews
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));

drop policy if exists "members read renewal review events" on public.renewal_review_events;
create policy "members read renewal review events" on public.renewal_review_events
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));

revoke all on public.renewal_reviews from anon, authenticated;
revoke all on public.renewal_review_events from anon, authenticated;
grant select on public.renewal_reviews to authenticated;
grant select on public.renewal_review_events to authenticated;
