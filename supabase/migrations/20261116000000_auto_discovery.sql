-- Contract Radar: auto-discovery of paid tools from QuickBooks / Xero (spend) and
-- Google Workspace / Microsoft Entra ID (sign-ins). Builds on 20261115120000_team_onboarding.sql.
-- Safe to re-run in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Connections: one per provider per workspace. No secrets in this table.
-- ---------------------------------------------------------------------------

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('quickbooks', 'xero', 'google', 'microsoft')),
  status text not null default 'connected' check (status in ('connected', 'error')),
  account_name text,           -- company / tenant / domain name shown on the Sources card
  external_id text,            -- QuickBooks realm ID, Xero tenant ID, Entra tenant ID
  last_synced_at timestamptz,
  last_error text,
  summary jsonb,               -- { tools, spend, users } from the last sync
  connected_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

-- OAuth tokens, encrypted by the app (AES-256-GCM, key in CONNECTOR_ENCRYPTION_KEY). Admins only.
create table if not exists public.connection_secrets (
  connection_id uuid primary key references public.connections (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- What each source found. Rebuilt from scratch on every sync of that source.
-- ---------------------------------------------------------------------------

create table if not exists public.discovery_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('quickbooks', 'xero', 'google', 'microsoft')),
  vendor_key text not null check (char_length(vendor_key) between 1 and 80),
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'Other',
  dept_hint text,
  kind text not null check (kind in ('spend', 'usage')),
  annual_spend numeric,
  payment_count int,
  last_seen date,
  cadence text,
  currency text,
  users int,
  licensed int,
  dept_counts jsonb,           -- people per directory department, e.g. {"Sales": 8}
  evidence text,
  created_at timestamptz not null default now()
);
create index if not exists discovery_signals_ws_idx on public.discovery_signals (workspace_id, provider);

-- The admin's review decisions per vendor (new / added to tools / dismissed).
create table if not exists public.discovered_tools (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  vendor_key text not null,
  status text not null default 'new' check (status in ('new', 'imported', 'dismissed')),
  department_id uuid references public.departments (id) on delete set null,
  department_set boolean not null default false,  -- true once an admin picked the department by hand
  tool_id uuid references public.tools (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, vendor_key)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.connections enable row level security;
alter table public.connection_secrets enable row level security;
alter table public.discovery_signals enable row level security;
alter table public.discovered_tools enable row level security;

-- Connections: everyone in the workspace sees which sources are connected; admins manage them.
drop policy if exists "members read connections" on public.connections;
create policy "members read connections" on public.connections
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "admins add connections" on public.connections;
create policy "admins add connections" on public.connections
  for insert to authenticated with check ((select public.is_workspace_owner(workspace_id)));
drop policy if exists "admins update connections" on public.connections;
create policy "admins update connections" on public.connections
  for update to authenticated
  using ((select public.is_workspace_owner(workspace_id))) with check ((select public.is_workspace_owner(workspace_id)));
drop policy if exists "admins delete connections" on public.connections;
create policy "admins delete connections" on public.connections
  for delete to authenticated using ((select public.is_workspace_owner(workspace_id)));

-- Secrets: admins only, for every operation. Department owners can't even read the encrypted tokens.
drop policy if exists "admins manage secrets" on public.connection_secrets;
create policy "admins manage secrets" on public.connection_secrets
  for all to authenticated
  using ((select public.is_workspace_owner(workspace_id)))
  with check (
    (select public.is_workspace_owner(workspace_id))
    and exists (select 1 from public.connections c where c.id = connection_id and c.workspace_id = connection_secrets.workspace_id)
  );

-- Signals: members read, admins write (syncs run as the admin).
drop policy if exists "members read signals" on public.discovery_signals;
create policy "members read signals" on public.discovery_signals
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "admins write signals" on public.discovery_signals;
create policy "admins write signals" on public.discovery_signals
  for insert to authenticated with check ((select public.is_workspace_owner(workspace_id)));
drop policy if exists "admins delete signals" on public.discovery_signals;
create policy "admins delete signals" on public.discovery_signals
  for delete to authenticated using ((select public.is_workspace_owner(workspace_id)));

-- Review state: members read, admins write.
drop policy if exists "members read discovered" on public.discovered_tools;
create policy "members read discovered" on public.discovered_tools
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
drop policy if exists "admins add discovered" on public.discovered_tools;
create policy "admins add discovered" on public.discovered_tools
  for insert to authenticated
  with check (
    (select public.is_workspace_owner(workspace_id))
    and (department_id is null or exists (
      select 1 from public.departments d where d.id = department_id and d.workspace_id = discovered_tools.workspace_id))
    and (tool_id is null or exists (
      select 1 from public.tools t where t.id = tool_id and t.workspace_id = discovered_tools.workspace_id))
  );
drop policy if exists "admins update discovered" on public.discovered_tools;
create policy "admins update discovered" on public.discovered_tools
  for update to authenticated
  using ((select public.is_workspace_owner(workspace_id)))
  with check (
    (select public.is_workspace_owner(workspace_id))
    and (department_id is null or exists (
      select 1 from public.departments d where d.id = department_id and d.workspace_id = discovered_tools.workspace_id))
    and (tool_id is null or exists (
      select 1 from public.tools t where t.id = tool_id and t.workspace_id = discovered_tools.workspace_id))
  );
drop policy if exists "admins delete discovered" on public.discovered_tools;
create policy "admins delete discovered" on public.discovered_tools
  for delete to authenticated using ((select public.is_workspace_owner(workspace_id)));

grant select, insert, update, delete on public.connections to authenticated;
grant select, insert, update, delete on public.connection_secrets to authenticated;
grant select, insert, delete on public.discovery_signals to authenticated;
grant select, insert, update, delete on public.discovered_tools to authenticated;
