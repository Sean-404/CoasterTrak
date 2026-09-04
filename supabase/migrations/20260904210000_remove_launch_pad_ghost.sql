-- Blackpool "Launch Pad" is a ThemeParks queue ghost that Wikipedia matched to the
-- generic "Launched roller coaster" type article — not a real park install.
-- Dam Sen's real ride named "Roller Coaster" wrongly got that taxonomy summary too.

-- Drop user data tied to the Launch Pad stub (user already has Icon credited).
delete from ride_events where coaster_id = 5916;
delete from rides where coaster_id = 5916;
delete from wishlist where coaster_id = 5916;
update profiles set favorite_ride_id = null where favorite_ride_id = 5916;
delete from data_coaster_source_links where coaster_id = 5916;
delete from data_review_findings where coaster_id = 5916;
delete from coasters where id = 5916 and name ilike 'Launch Pad';

-- Clear taxonomy Wikipedia pollution on Dam Sen's real "Roller Coaster" (Q7361013).
update coasters
set
  enwiki_title = null,
  summary_text = null,
  image_url = case
    when image_url ilike '%wikipedia%' or image_url ilike '%wikimedia%' then null
    else image_url
  end,
  last_synced_at = now()
where id = 463
  and wikidata_id = 'Q7361013'
  and enwiki_title = 'Roller coaster';
