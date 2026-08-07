-- Purge remaining Queue-Times-style non-coaster stubs globally.
-- Safe: only Unknown/Other rows with no Wikidata, no stats, and no user FKs.

delete from coasters c
where coalesce(c.coaster_type, 'Unknown') in ('Unknown', 'Other')
  and c.wikidata_id is null
  and c.height_ft is null
  and c.speed_mph is null
  and c.length_ft is null
  and c.inversions is null
  and c.duration_s is null
  and not exists (select 1 from rides r where r.coaster_id = c.id)
  and not exists (select 1 from wishlist w where w.coaster_id = c.id)
  and not exists (select 1 from profiles pr where pr.favorite_ride_id = c.id);
