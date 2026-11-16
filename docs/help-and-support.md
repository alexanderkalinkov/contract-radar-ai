# Help, account page and support

## What's in the app

- **First sign-in tour.** The 6-minute onboarding video opens in a window the first time someone lands in the app. Closing it (or pressing Esc) marks it seen in their Supabase Auth user metadata (`tour_seen_at`) and in the browser, so it doesn't open by itself again. If the video can't load, the window closes quietly and tries again next visit.
- **Help & support** (`/help`, sidebar). The tour inline, quick answers, and the Contact support form. The sidebar link adds `?from=<page>` so the email says which page they were on.
- **My account** (`/account`, sidebar, or click your name at the bottom of the sidebar). Name and job title (user metadata, no table), email and role (read only), change password (checks the current one first; hidden for SSO sign-ins), Watch the tour, Sign out, Sign out on all devices (`POST /auth/signout?scope=global`).
- **Contact support** (`POST /api/support`). Emails `SUPPORT_EMAIL` through Resend with reply-to set to the person, so Reply answers them. Includes their name, email, user id, workspace, role, plan, the page they came from, browser and screen size, the last 5 errors on their tab (uncaught errors and 5xx API answers), and an optional screenshot (PNG/JPG/GIF/WebP/PDF/text, 3 MB max). Signed-in senders get a "We got your message" copy. Limited to 5 messages per 10 minutes per person.
- The sign-in page shows "Trouble signing in? Email …" when a support address is set.

## Setup

| Variable | What |
| --- | --- |
| `SUPPORT_EMAIL` | The inbox support messages go to. Falls back to `LEGAL_EMAIL`, then `EMAIL_REPLY_TO`. Needs `RESEND_API_KEY` and `EMAIL_FROM` (already set for reminders). |
| `HELP_VIDEO_URL` | Optional. Defaults to the public Supabase Storage file below. |

### Hosting the video

The MP4 (22 MB) stays out of git. It lives in a **public** Supabase Storage bucket called `help` (created 2026-11-16, 50 MB file limit, mp4/jpeg/png only):

`https://<project>.supabase.co/storage/v1/object/public/help/contract-radar-onboarding.mp4`

To replace it: Supabase dashboard → Storage → `help` → upload `contract-radar-onboarding.mp4` (overwrite). If the bucket is missing, create it with:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('help', 'help', true, 52428800, array['video/mp4','image/jpeg','image/png'])
on conflict (id) do nothing;
```

To host it elsewhere (Vercel Blob or any CDN), set `HELP_VIDEO_URL` to a direct MP4 link. The poster frame is `public/help/tour-poster.jpg`.

No database migration is needed for any of this.
