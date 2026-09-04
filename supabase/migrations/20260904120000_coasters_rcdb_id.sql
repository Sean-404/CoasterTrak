-- Persist RCDB IDs from Wikidata P2751 (identifiers only; not RCDB content ingest).
alter table coasters
  add column if not exists rcdb_id text;

create unique index if not exists coasters_rcdb_id_uidx
  on coasters (rcdb_id)
  where rcdb_id is not null;

comment on column coasters.rcdb_id is
  'Roller Coaster Database numeric ID (Wikidata P2751). Deep-link only until written permission for stats.';

-- Allow field overrides sourced from RCDB after written permission.
alter table data_coaster_field_overrides
  drop constraint if exists data_coaster_field_overrides_source_check;

alter table data_coaster_field_overrides
  add constraint data_coaster_field_overrides_source_check
  check (source in ('official_website', 'themeparks_wiki', 'wikidata', 'manual', 'review', 'rcdb'));
