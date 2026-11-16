-- Demo workspace for sales calls.
-- Run this whole file once in the Supabase SQL editor. It only adds things, so it is safe to run again.
--
-- A demo workspace is an ordinary workspace filled with realistic data for the fictional Northwind Logistics.
-- The app creates and resets it on the server (with the service role key), from Workspace settings.
-- Resetting deletes everything in it and seeds it again, so it is only allowed when is_demo is true.

alter table public.workspaces
  add column if not exists is_demo boolean not null default false;

-- Only the server (service role) may mark a workspace as a demo or unmark it. Signed-in users can still
-- rename the workspace and change its settings, but an attempt to flip is_demo is silently ignored, so nobody
-- can turn a real workspace into one that the reset button is allowed to wipe.
create or replace function public.protect_is_demo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_demo is distinct from old.is_demo and coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' then
    new.is_demo := old.is_demo;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_is_demo on public.workspaces;
create trigger protect_is_demo
  before update on public.workspaces
  for each row execute function public.protect_is_demo();
