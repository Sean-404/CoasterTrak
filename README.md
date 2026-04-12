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
4. Run schema in Supabase SQL editor:
   - `supabase/schema.sql`
   - Catalog JSON bucket (for hosting `wikidata_coasters.json`): `supabase/migrations/003_catalog_storage_bucket.sql`
5. Start app:
   - `npm run dev`
6. Build the Wikidata catalog snapshot (large JSON; gitignored by default):
   - `npm run wikidata:fetch` → writes `data/wikidata_coasters.json`
7. Populate / refresh the Supabase catalog from that snapshot (optional, local testing):
   - `curl -X POST "http://localhost:3000/api/sync/catalog" -H "Authorization: Bearer <SYNC_CRON_SECRET>"`

## Key routes

- `/` - landing page
- `/map` - interactive map with country and name filter
- `/api/queue-times/:parkId` - cached proxy for Queue-Times live waits
- `/login` - sign up / sign in
- `/wishlist` - user wishlist
- `/stats` - personal stats dashboard
- `/api/health` - health endpoint
- `POST /api/sync/catalog` - protected catalog sync (default: Wikidata JSON → Supabase). Optional: `?source=queue-times` for a Queue-Times–only refresh (live-wait ride lists where that API lists the park).

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

**Primary catalog (map pins, coaster rows):** loaded from a **Wikidata JSON snapshot** (`npm run wikidata:fetch` → `data/wikidata_coasters.json`). The server reads that file from the deployment root, or from **`WIKIDATA_COASTERS_URL`** if set (recommended for Vercel, since `data/wikidata_coasters.json` is gitignored). Optional override: **`WIKIDATA_COASTERS_PATH`** (absolute or repo-relative path).

**Supabase Storage (recommended):** apply `supabase/migrations/003_catalog_storage_bucket.sql` once, then after each `wikidata:fetch` run:

- `npm run wikidata:upload-storage` — uploads `data/wikidata_coasters.json` to the public `catalog` bucket and prints the public URL.

Set **`WIKIDATA_COASTERS_URL`** to that URL in Vercel (and locally if you test remote sync). The monthly GitHub Action runs this upload automatically after fetching Wikidata.

Optional env overrides: **`WIKIDATA_STORAGE_BUCKET`** (default `catalog`), **`WIKIDATA_STORAGE_OBJECT`** (default `wikidata_coasters.json`).

**Alternatives:** GitHub Releases asset URL, or S3/R2, if you prefer not to use Storage.

Avoid checking multi‑MB JSON into git; generate in CI and upload to Storage (or elsewhere), then point `WIKIDATA_COASTERS_URL` at the stable URL.

**Queue-Times:** still used for **live wait times** in map popups where a park has a `queue_times_park_id`. Run `POST /api/sync/catalog?source=queue-times` occasionally (or rely on `/api/cron/sync-queue-times`) to attach/update Queue-Times parks and ride names for those APIs.

The GitHub Action `.github/workflows/refresh-wikidata.yml` fetches and enriches Wikidata rows, uploads the JSON to Supabase Storage, then runs `upload-wikidata-to-db.ts` (field-level DB updates). For a **full** park/coaster upsert from the same dataset, trigger `POST /api/sync/catalog` after the snapshot is in Storage (or use local file for dev).

Required env vars for server-side sync:
- `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_CRON_SECRET`
- For production without committing the JSON: `WIKIDATA_COASTERS_URL`

Run manually (local dev server, after `wikidata:fetch`):

- `curl -X POST http://localhost:3000/api/sync/catalog -H "Authorization: Bearer <SYNC_CRON_SECRET>"`
- Queue-Times refresh only: add `?source=queue-times`

`vercel.json` schedules `/api/cron/sync-catalog` (Wikidata catalog) and `/api/cron/sync-queue-times` (Queue-Times) on cron schedules.
