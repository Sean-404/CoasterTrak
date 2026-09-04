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
6. Build a catalog snapshot via CoasterTrak Data (gitignored by default):
   - `npm run data:ingest-wikidata`
   - `npm run data:normalize-wikidata -- --latest`
   - `npm run data:materialize-snapshot -- --latest`
7. Optionally enrich / publish locally:
   - `npm run data:enrich-wikipedia -- --enrich-limit 200`
   - `npm run data:publish-catalog -- --apply` (requires service role key)
8. Or trigger a full park/coaster upsert from Storage / local JSON:
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

**Primary catalog (map pins, coaster rows):** built by the **CoasterTrak Data** pipeline and stored as `data/wikidata_coasters.json` (working snapshot). The server reads that file from the deployment root, or from **`WIKIDATA_COASTERS_URL`** if set (recommended for Vercel, since the JSON is gitignored). Optional override: **`WIKIDATA_COASTERS_PATH`**.

**Supabase Storage (recommended):** apply `supabase/migrations/003_catalog_storage_bucket.sql` once. Monthly CI gated publish uploads the approved snapshot to the public `catalog` bucket.

Set **`WIKIDATA_COASTERS_URL`** to that URL in Vercel (and locally if you test remote sync).

Optional env overrides: **`WIKIDATA_STORAGE_BUCKET`** (default `catalog`), **`WIKIDATA_STORAGE_OBJECT`** (default `wikidata_coasters.json`), **`WIKIDATA_COASTERS_ALLOWED_HOSTS`** (comma-separated host allowlist for `WIKIDATA_COASTERS_URL`; by default your Supabase project host is allowed).

Avoid checking multi‑MB JSON into git; generate in CI and upload to Storage, then point `WIKIDATA_COASTERS_URL` at the stable URL.

The GitHub Action `.github/workflows/refresh-wikidata.yml` runs **monthly**:

`ingest → normalize → materialize → Wikipedia enrich → analyze → validate → gated publish (--apply) → DB Wikipedia backfill`

For a **full** park/coaster upsert from the same Storage URL, Vercel’s weekly cron hits `/api/cron/sync-catalog` so `syncCatalogFromWikidata` re-reads `WIKIDATA_COASTERS_URL`.

Required env vars for server-side sync:
- `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_CRON_SECRET`
- For production without committing the JSON: `WIKIDATA_COASTERS_URL`

Security notes:
- Sync endpoints (`/api/sync/catalog`, `/api/cron/sync-catalog`) require `Authorization: Bearer <SYNC_CRON_SECRET>` and are rate-limited.
- Errors from sync endpoints are intentionally generic; see server logs for details.

Run manually (local dev server, after materializing a snapshot):

- `curl -X POST http://localhost:3000/api/sync/catalog -H "Authorization: Bearer <SYNC_CRON_SECRET>"`

`vercel.json` schedules `/api/cron/sync-catalog` **weekly** (Sundays 05:00 UTC — Wikidata catalog apply).

### Why some coasters have no length / height / speed

Stats come from **Wikidata** (SPARQL → CoasterTrak Data pipeline) and optional Wikipedia enrich/backfill. Empty stats usually mean Wikidata has no quantity, the snapshot was never published, or enrich has not run yet.

**Wikipedia infobox DB backfill (optional):** for rows that already have `wikidata_id` but still lack numbers:

- `npm run wikipedia:backfill` — fills **null** columns only; use `--dry-run` to preview.

### RCDB identifiers (and optional stats, with permission)

Wikidata already exposes RCDB IDs (property P2751). Catalog sync stores them on `coasters.rcdb_id` and coaster pages can deep-link to rcdb.com. That does **not** copy RCDB stats.

RCDB [Terms of Use](https://rcdb.com/tou.htm) require written permission before using content in an app/database. Draft email: `scripts/data/rcdb-permission-request.txt` → `feedback@rcdb.com`.

After permission:

- Put a licensed JSON export at `data/rcdb_stats.json` (see `data/rcdb_stats.example.json`)
- `npm run data:enrich-rcdb -- --permission-granted --from data/rcdb_stats.json` (null-fill snapshot)
- Add `--write-db` to also write Supabase null-fills + `data_coaster_field_overrides` (`source=rcdb`)

Backfill IDs only (no permission needed): `npm run data:backfill-rcdb-ids` after applying migration `20260904120000_coasters_rcdb_id.sql`.

### CoasterTrak Data — ThemeParks.wiki verification

Compare the live catalog against [ThemeParks.wiki](https://api.themeparks.wiki/) (existence / naming — not stats):

- `npm run data:match-themeparks` — auto-matches **all** catalog parks by name + cached DB links; writes `data/themeparks-match-report.json`
- `npm run data:match-themeparks -- --write-db` — persists links, findings, and review queue
- Admin review: `/admin/data` — save aliases or rename coasters (stored in DB, not code)
- Migrations: `20260811122151_*`, `20260811122641_*`, `20260811123330_*`
- Aliases: `data_coaster_name_aliases` · field overrides: `data_coaster_field_overrides`

### CoasterTrak Data — pipeline (in-repo)

Lives under `src/lib/coastertrak-data/`.

```text
data:ingest-wikidata
        ↓
data:normalize-wikidata
        ↓
data:materialize-snapshot   → data/wikidata_coasters.json
        ↓
data:enrich-wikipedia
        ↓
data:analyze-catalog
data:validate-wikidata
        ↓
data:publish-catalog [--apply]
```

| Command | Purpose |
|---------|---------|
| `data:ingest-wikidata` | Immutable SPARQL bindings → `data/raw/wikidata/{runId}/` |
| `data:normalize-wikidata` | Deduped rows → `data/processed/wikidata/{runId}/` |
| `data:materialize-snapshot` | Copy processed → working `data/wikidata_coasters.json` |
| `data:enrich-wikipedia` | Fill gaps from enwiki infobox HTML |
| `data:enrich-rcdb` | Null-fill from licensed RCDB export (requires `--permission-granted`) |
| `data:backfill-rcdb-ids` | Set `coasters.rcdb_id` from Wikidata snapshot P2751 |
| `data:validate-wikidata` | Quality report → `data/reports/wikidata/{runId}/` |
| `data:analyze-catalog` | Dedupe/conflicts + ThemeParks snapshot verify |
| `data:publish-catalog` | Dry-run by default; `--apply` uploads to Supabase |
| `npm test` | Vitest unit tests (also in `.github/workflows/ci.yml`) |

Gated publish applies known fixes + approved `data_coaster_field_overrides` before Storage/DB upload. Catalog sync endpoints read the Storage URL that gated publish updates.
