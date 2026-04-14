-- Add optional coaster image URL from Wikidata Commons (P18).
alter table coasters
  add column if not exists image_url text;
