-- Contract Radar: seat usage from login activity. Builds on 20261116000000_auto_discovery.sql.
-- Google Workspace and Microsoft Entra ID syncs now record, per app, how many people signed in during
-- the last 30 days, the latest sign-in, and who has gone quiet, so "cut seats" can rest on real logins.
-- Safe to re-run in the Supabase SQL editor.

alter table public.discovery_signals add column if not exists active_users int;  -- signed in during the last 30 days
alter table public.discovery_signals add column if not exists last_login date;   -- latest sign-in by anyone
alter table public.discovery_signals add column if not exists window_days int;   -- days of sign-in history looked at (Google 90, Microsoft 30)
alter table public.discovery_signals add column if not exists idle_people jsonb; -- [{"email": "...", "last": "YYYY-MM-DD" or ""}], capped at 100

-- Existing policies on discovery_signals (members read, admins write) cover the new columns.
