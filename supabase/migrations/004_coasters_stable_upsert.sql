-- Upsert by stable external keys so renames (same Wikidata Q-id or Queue-Times ride id)
-- update one row instead of inserting a second under unique (park_id, name).
create unique index if not exists coasters_park_source_external_uidx
  on coasters (park_id, external_source, external_id)
  where external_id is not null and external_source is not null;
