-- Add Wikidata enrichment columns to the coasters table.
-- These are all nullable; existing rows are unaffected.
-- Run once against your Supabase project via the SQL editor.

alter table coasters
  add column if not exists wikidata_id    text,
  add column if not exists length_ft      integer,
  add column if not exists speed_mph      integer,
  add column if not exists height_ft      integer,
  add column if not exists inversions     integer,
  add column if not exists opening_year   integer,
  add column if not exists closing_year   integer;

-- Optional: index wikidata_id for fast lookups
create index if not exists idx_coasters_wikidata_id on coasters(wikidata_id);
