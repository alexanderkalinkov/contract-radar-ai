# Bulk import

Import hundreds or thousands of contracts at once from **Contracts → Bulk import** (`/import`).

## Sources

| Source | Works now? | Notes |
| --- | --- | --- |
| ZIP file or folder from your computer | Yes, once the SQL is run | Unpacked in the browser (no size limit for the ZIP itself), each file uploaded straight to private storage. |
| Google Drive (My Drive and shared drives) | After Google OAuth keys are set | Native Google Docs are exported as PDF. |
| SharePoint / OneDrive | After Microsoft OAuth keys are set | Pick My OneDrive or any SharePoint site's document library. |

Limits: PDF and Word (.docx) only, 20 MB per file, 5,000 files per import. Sub-folders are kept, and a folder
named like a department (for example `Marketing/` or `FanDuel/Marketing/`) files its contracts under that department.

## How it works

1. **Files in.** ZIP/folder: the browser fingerprints each file (SHA-256) and asks the server which ones the
   workspace already has, then uploads only the new ones to `contracts/<workspace>/<item id>.<pdf|docx>`.
   Cloud folders: the server walks the folder tree itself in the background.
2. **Queue.** Every file is a row in `import_items`. A background worker (`/api/imports/worker`) takes files with
   `FOR UPDATE SKIP LOCKED`, reads `IMPORT_CONCURRENCY` (default 3) at a time with the same two-request Claude
   extraction as single uploads, and stops taking new files after ~170 s so it stays inside Vercel's 300 s limit.
   When work remains it starts the next run itself. A daily cron (06:30 UTC) and the review page (while open)
   restart it if a chain ever breaks.
3. **Rate limits.** A Claude 429 puts the file back with a 60 s backoff and doesn't count as a try. Other server
   errors retry up to 3 times. Files left half-read by a run that died are picked up again after 10 minutes.
4. **Duplicates.** Exact same file (by SHA-256) as an existing contract or an earlier import file: marked
   "Already have" and never sent to Claude. Same vendor, term end and fee as an existing contract: read, but
   flagged "Looks like a contract you already have".
5. **Review.** Nothing lands in Contracts until someone adds it. Tabs: *Ready to add* (nothing to check),
   *Needs a look* (low-confidence dates or fee, possible duplicate, or not a contract), *In progress*,
   *Couldn't read*, *Already have*, *Added*, *Skipped*. Click a file to see every value with its quote and page.
   "Add all ready contracts" adds every clean one in one click; added files become contracts with
   `source = 'import'` plus a suggested tool in their department. Plan limits apply when adding.

## Setup

1. Run `supabase/migrations/20261116220000_bulk_import.sql` in the Supabase SQL editor (safe to run again).
2. `SUPABASE_SERVICE_ROLE_KEY` must be set (it already is for the email inbox). The worker's secret is derived
   from it, so nothing else is needed. Optional: `IMPORT_CONCURRENCY` (1 to 8), `IMPORT_WORKER_SECRET`.
3. Cost: every file is two Claude requests (about the same as a single upload). 1,000 contracts at 3 at a time
   takes roughly 4 to 6 hours. Raise `IMPORT_CONCURRENCY` if your Anthropic rate limits allow it.

### Google Drive (when the real domain is live)

Uses the same Google OAuth client as auto-discovery (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and
`CONNECTOR_ENCRYPTION_KEY`.

1. Google Cloud console → enable the **Google Drive API** for the project.
2. OAuth client → add the redirect URI `https://<APP_URL>/api/drives/gdrive/callback`.
3. OAuth consent screen → add the scope `https://www.googleapis.com/auth/drive.readonly`.

`drive.readonly` is a *restricted* scope. An **Internal** app (your own Google Workspace) or a **Testing** app with
listed test users works right away. To offer it to every customer, Google requires app verification plus a
yearly security assessment (CASA). Enterprise customers can instead mark the app as trusted in their Google
admin console.

### SharePoint / OneDrive (when the real domain is live)

Uses the Microsoft app from auto-discovery (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`).

1. Entra admin center → App registrations → the app → Authentication → add the redirect URI
   `https://<APP_URL>/api/drives/onedrive/callback` (Web).
2. API permissions → Microsoft Graph → Delegated: `Files.Read.All`, `Sites.Read.All`, `User.Read`,
   `offline_access`. Many tenants require an admin to grant consent for these.

Drive sign-ins are per person and stored encrypted in `drive_connections`, readable only by the server.

## Tables

- `import_jobs`: one per import (source, status, cloud folder cursor).
- `import_items`: one per file (status, attempts, backoff, SHA-256, extraction, flags, department).
  An added item's contract has the item's own id.
- `drive_connections`: encrypted Google/Microsoft tokens (service role only).
- `import_worker`: the single worker lease.
- `contracts.file_hash` and `contracts.source = 'import'`.
