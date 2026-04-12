-- Ride duration (track time), seconds — from Wikidata P2047 / Wikipedia infobox.
alter table coasters
  add column if not exists duration_s integer;
