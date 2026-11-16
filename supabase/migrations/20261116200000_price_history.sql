-- Contract Radar: price-hike tracking.
-- The app lines up documents for the same vendor (last year's order form, this year's renewal quote, the signed
-- renewal) on its own. This column lets someone fix a match by hand from the contract page:
--   null            match automatically (the default)
--   another id      compare this document with that earlier one
--   its own id      don't compare this document with anything
-- Safe to run more than once.

alter table public.contracts
  add column if not exists supersedes_id uuid references public.contracts (id) on delete set null;

create index if not exists contracts_supersedes_idx on public.contracts (supersedes_id);

-- Only link documents inside the same workspace.
create or replace function public.contracts_check_supersedes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.supersedes_id is not null and new.supersedes_id <> new.id and not exists (
    select 1 from public.contracts c where c.id = new.supersedes_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'supersedes_id must point to a contract in the same workspace';
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_check_supersedes on public.contracts;
create trigger contracts_check_supersedes
  before insert or update of supersedes_id on public.contracts
  for each row execute function public.contracts_check_supersedes();
