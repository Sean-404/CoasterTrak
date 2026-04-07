# CoasterTrak MVP

CoasterTrak is an MVP rollercoaster tracking app with:
- Interactive map with park/coaster markers
- Live queue times in map popups (where available)
- Email/password auth
- Wishlist tracking
- Ride logging and personal stats

## Local setup

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `copy .env.example .env.local`
3. Fill values in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SYNC_CRON_SECRET`
   - `KAGGLE_CSV_URL` (see GitHub Action section below)
4. Run schema in Supabase SQL editor:
   - `supabase/schema.sql`
5. Start app:
   - `npm run dev`
6. Populate catalog from Kaggle (after GitHub Action has run once):
   - `curl -X POST "http://localhost:3000/api/sync/catalog?source=kaggle" -H "Authorization: Bearer <SYNC_CRON_SECRET>"`

## Key routes

- `/` - landing page
- `/map` - interactive map with country and name filter
- `/api/queue-times/:parkId` - cached proxy for Queue-Times live waits
- `/login` - sign up / sign in
- `/wishlist` - user wishlist
- `/stats` - personal stats dashboard
- `/api/health` - health endpoint
- `POST /api/sync/catalog` - protected catalog sync job (Queue-Times -> Supabase)
  - Optional source: `POST /api/sync/catalog?source=kaggle`

## Deploy (Vercel free tier)

1. Import repo in Vercel.
2. Add env vars from `.env.local` in Vercel project settings.
3. Deploy.
4. Validate:
   - user signup/signin
   - map markers visible
   - wishlist and rides saved
   - stats totals update

## Live queue data credits

Queue data is powered by [Queue-Times.com](https://queue-times.com/).

## Automated catalog sync

This repo includes a server-side sync pipeline that populates parks/coasters automatically from Kaggle (catalog) and Queue-Times (live waits). No manual seed files needed.

Required env vars:
- `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_CRON_SECRET`
- Optional for CSV source: `KAGGLE_CSV_URL`

Run manually (local dev server):
- `curl -X POST http://localhost:3000/api/sync/catalog -H "Authorization: Bearer <SYNC_CRON_SECRET>"`
- Kaggle CSV source: `curl -X POST "http://localhost:3000/api/sync/catalog?source=kaggle" -H "Authorization: Bearer <SYNC_CRON_SECRET>"`

Schedule daily (Vercel cron / GitHub Action) to stay inside free-tier usage.

## GitHub Action: Auto-refresh Kaggle CSV

Workflow file: `.github/workflows/refresh-kaggle-dataset.yml`

What it does:
- Downloads `robikscube/rollercoaster-database` via Kaggle API
- Extracts `data/coaster_db.csv`
- Commits/pushes changes automatically (weekly + manual trigger)

One-time GitHub setup:
1. In GitHub repo, open Settings -> Secrets and variables -> Actions.
2. Add repository secrets:
   - `KAGGLE_USERNAME`
   - `KAGGLE_KEY`
   - `APP_URL` — your deployed app URL, e.g. `https://coastertrak.vercel.app` (no trailing slash)
   - `SYNC_CRON_SECRET` — same value as in your `.env.local`
3. Run the workflow once from Actions tab (`workflow_dispatch`).
   - This commits `data/coaster_db.csv` **and** immediately calls `/api/cron/sync-catalog` to populate Supabase.
4. Set `KAGGLE_CSV_URL` in `.env.local` and your Vercel environment variables to:
   - `https://raw.githubusercontent.com/Sean-404/CoasterTrak/main/data/coaster_db.csv`

After that, everything is fully automatic:
- Every Monday the Action refreshes the CSV and triggers the sync.
- Every Tuesday a Vercel Cron double-checks by calling `/api/cron/sync-catalog` again.
