-- Bulk import: hundreds or thousands of contracts at once, from a ZIP file, a folder of files,
-- Google Drive, or SharePoint / OneDrive. Every file becomes an import item that a background worker
-- reads with Claude; the results wait on a review screen until someone adds them to Contracts.
-- Run this whole file once in the Supabase SQL editor. It only adds things, so it is safe to run again.

-- ---------------------------------------------------------------------------
-- Contracts remember where they came from and a fingerprint of the file, so the same file is never
-- read (or paid for) twice.
-- ---------------------------------------------------------------------------

alter table public.contracts add column if not exists file_hash text;  -- SHA-256 of the original file, hex
create index if not exists contracts_file_hash_idx on public.contracts (workspace_id, file_hash) where file_hash is not null;

alter table public.contracts drop constraint if exists contracts_source_check;
alter table public.contracts add constraint contracts_source_check check (source in ('upload', 'email', 'import'));

-- ---------------------------------------------------------------------------
-- Import jobs and their files. Written only by the server (service role); members can read them.
-- ---------------------------------------------------------------------------

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  source text not null check (source in ('zip', 'files', 'gdrive', 'onedrive')),
  name text not null check (char_length(name) between 1 and 300),   -- ZIP file name or folder name
  -- uploading: the browser is still sending files · listing: the server is walking a cloud folder
  -- running: files are being read · review: everything is read, results wait for review · done · cancelled · failed
  status text not null default 'uploading' check (status in ('uploading', 'listing', 'running', 'review', 'done', 'cancelled', 'failed')),
  remote jsonb,          -- cloud folders: { connection_id, root, pending: [folder ids still to list] }
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists import_jobs_workspace_idx on public.import_jobs (workspace_id, created_at desc);

create table if not exists public.import_items (
  id uuid primary key default gen_random_uuid(),      -- the contract gets this same id when the item is added
  job_id uuid not null references public.import_jobs (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  file_name text not null,
  folder text,                    -- path inside the ZIP or cloud folder, without the file name
  kind text not null check (kind in ('pdf', 'docx')),
  size bigint,
  remote_id text,                 -- Google Drive file id or "<driveId>:<itemId>" for Microsoft
  file_path text,                 -- object in the private "contracts" bucket, once the file is there
  sha256 text,
  -- waiting_upload → queued → processing → ready → added / skipped; or duplicate / failed
  status text not null default 'waiting_upload'
    check (status in ('waiting_upload', 'queued', 'processing', 'ready', 'duplicate', 'failed', 'added', 'skipped')),
  attempts int not null default 0,
  not_before timestamptz,         -- backoff after a rate limit
  locked_at timestamptz,          -- when a worker took it
  error text,
  extraction jsonb,
  vendor text,                    -- copied out of the extraction for sorting and duplicate checks
  term_end date,
  annual_fee numeric,
  currency text,
  notice_deadline date,
  model text,
  demo boolean not null default false,
  flags text[] not null default '{}',       -- low_confidence, possible_duplicate, not_a_contract
  duplicate_of uuid,                        -- contract id (or import item id) this file repeats
  department_id uuid references public.departments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists import_items_job_idx on public.import_items (job_id, status, created_at);
create index if not exists import_items_queue_idx on public.import_items (created_at) where status in ('queued', 'processing');
create index if not exists import_items_hash_idx on public.import_items (workspace_id, sha256) where sha256 is not null;

alter table public.import_jobs enable row level security;
alter table public.import_items enable row level security;

drop policy if exists "members read import jobs" on public.import_jobs;
create policy "members read import jobs" on public.import_jobs
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "members read import items" on public.import_items;
create policy "members read import items" on public.import_items
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));

grant select on public.import_jobs, public.import_items to authenticated;

-- ---------------------------------------------------------------------------
-- Cloud drive sign-ins (Google Drive, SharePoint / OneDrive), one per person per workspace.
-- Tokens are encrypted by the app (CONNECTOR_ENCRYPTION_KEY) and only the server can read them.
-- ---------------------------------------------------------------------------

create table if not exists public.drive_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('gdrive', 'onedrive')),
  account_email text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, provider)
);
alter table public.drive_connections enable row level security;
-- No policies and no grants: only the service role touches this table.
revoke all on public.drive_connections from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The worker queue. One worker run at a time holds the lease; it takes files with SKIP LOCKED so a
-- second run could never read the same file twice anyway.
-- ---------------------------------------------------------------------------

create table if not exists public.import_worker (
  id int primary key default 1 check (id = 1),
  run_id uuid,
  lease_until timestamptz
);
insert into public.import_worker (id) values (1) on conflict (id) do nothing;
alter table public.import_worker enable row level security;
revoke all on public.import_worker from anon, authenticated;

create or replace function public.import_take_lease(p_run uuid, p_seconds int)
returns boolean
language sql
volatile
set search_path = ''
as $$
  with t as (
    update public.import_worker
    set run_id = p_run, lease_until = now() + make_interval(secs => p_seconds)
    where id = 1 and (lease_until is null or lease_until < now() or run_id = p_run)
    returning 1
  )
  select exists (select 1 from t);
$$;

create or replace function public.import_release_lease(p_run uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  update public.import_worker set lease_until = null where id = 1 and run_id = p_run;
$$;

-- Takes up to p_limit files that are waiting (or were left half-done by a run that died), oldest first.
create or replace function public.import_claim_items(p_limit int)
returns setof public.import_items
language sql
volatile
set search_path = ''
as $$
  update public.import_items i
  set status = 'processing', locked_at = now(), attempts = i.attempts + 1, updated_at = now()
  where i.id in (
    select q.id from public.import_items q
    where (q.status = 'queued' and (q.not_before is null or q.not_before <= now()))
       or (q.status = 'processing' and q.locked_at < now() - interval '10 minutes')
    order by q.created_at
    limit p_limit
    for update skip locked
  )
  returning i.*;
$$;

revoke all on function public.import_take_lease(uuid, int) from public, anon, authenticated;
revoke all on function public.import_release_lease(uuid) from public, anon, authenticated;
revoke all on function public.import_claim_items(int) from public, anon, authenticated;
grant execute on function public.import_take_lease(uuid, int) to service_role;
grant execute on function public.import_release_lease(uuid) to service_role;
grant execute on function public.import_claim_items(int) to service_role;
