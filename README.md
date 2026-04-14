# CoasterTrak MVP

CoasterTrak is an MVP rollercoaster tracking app with:
- Interactive map with park/coaster markers
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
- `/login` - sign up / sign in
- `/wishlist` - user wishlist
- `/stats` - personal stats dashboard
- `/api/health` - health endpoint
- `POST /api/sync/catalog` - protected Wikidata catalog sync (JSON → Supabase).

## Deploy (Vercel free tier)

1. Import repo in Vercel.
2. Add env vars from `.env.local` in Vercel project settings.
3. Deploy.
4. Validate:
   - user signup/signin
   - map markers visible
   - wishlist and rides saved
   - stats totals update

## Automated catalog sync

**Primary catalog (map pins, coaster rows):** loaded from a **Wikidata JSON snapshot** (`npm run wikidata:fetch` → `data/wikidata_coasters.json`). The server reads that file from the deployment root, or from **`WIKIDATA_COASTERS_URL`** if set (recommended for Vercel, since `data/wikidata_coasters.json` is gitignored). Optional override: **`WIKIDATA_COASTERS_PATH`** (absolute or repo-relative path).

**Supabase Storage (recommended):** apply `supabase/migrations/003_catalog_storage_bucket.sql` once, then after each `wikidata:fetch` run:

- `npm run wikidata:upload-storage` — uploads `data/wikidata_coasters.json` to the public `catalog` bucket and prints the public URL.

Set **`WIKIDATA_COASTERS_URL`** to that URL in Vercel (and locally if you test remote sync). The monthly GitHub Action runs this upload automatically after fetching Wikidata.

Optional env overrides: **`WIKIDATA_STORAGE_BUCKET`** (default `catalog`), **`WIKIDATA_STORAGE_OBJECT`** (default `wikidata_coasters.json`), **`WIKIDATA_COASTERS_ALLOWED_HOSTS`** (comma-separated host allowlist for `WIKIDATA_COASTERS_URL`; by default your Supabase project host is allowed).

**Alternatives:** GitHub Releases asset URL, or S3/R2, if you prefer not to use Storage.

Avoid checking multi‑MB JSON into git; generate in CI and upload to Storage (or elsewhere), then point `WIKIDATA_COASTERS_URL` at the stable URL.

The GitHub Action `.github/workflows/refresh-wikidata.yml` runs **monthly**: it fetches and enriches Wikidata rows, uploads the JSON to Supabase Storage, then runs `upload-wikidata-to-db.ts` (field-level DB updates). For a **full** park/coaster upsert from the same dataset, Vercel’s weekly cron hits `/api/cron/sync-catalog` so `syncCatalogFromWikidata` re-reads `WIKIDATA_COASTERS_URL` and applies parks/coasters (you can still trigger `POST /api/sync/catalog` manually after a fresh snapshot).

Required env vars for server-side sync:
- `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_CRON_SECRET`
- For production without committing the JSON: `WIKIDATA_COASTERS_URL`

Security notes:
- Sync endpoints (`/api/sync/catalog`, `/api/cron/sync-catalog`) require `Authorization: Bearer <SYNC_CRON_SECRET>` and are rate-limited.
- Errors from sync endpoints are intentionally generic; see server logs for details.

Run manually (local dev server, after `wikidata:fetch`):

- `curl -X POST http://localhost:3000/api/sync/catalog -H "Authorization: Bearer <SYNC_CRON_SECRET>"`

`vercel.json` schedules `/api/cron/sync-catalog` **weekly** (Sundays 05:00 UTC — Wikidata catalog apply).

### Why some coasters have no length / height / speed

CoasterTrak does **not** scrape Wikipedia pages. Stats come from **Wikidata** (structured data, SPARQL query → `data/wikidata_coasters.json`) and are written to your database when you run **`npx tsx scripts/upload-wikidata-to-db.ts`** (with `SUPABASE_SERVICE_ROLE_KEY`) or when CI runs that script after a fetch.

If a ride shows up but has empty stats: the row may not have matched a Wikidata item yet (name differences in the catalog), the snapshot was never uploaded to production, or the upload job has not been run since the coaster was added. Re-run `wikidata:fetch`, upload the JSON (or rely on `WIKIDATA_COASTERS_URL`), then run `upload-wikidata-to-db.ts` so name matching can attach `wikidata_id` and numeric fields.

**Wikipedia infobox fallback (optional):** For rows that already have `wikidata_id` but still lack some numbers, you can backfill from the English **`{{Infobox roller coaster}}`** via the MediaWiki API (wikitext, not HTML scraping):

- `npm run wikipedia:backfill` — runs `scripts/wikipedia-infobox-backfill.ts` (uses `data/wikidata_coasters.json` to map `wikidata_id` → English article title). Only fills **null** columns; respects Wikimedia rate limits with a delay between requests. Use `--dry-run` to preview.
