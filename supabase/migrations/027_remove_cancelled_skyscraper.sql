-- Remove cancelled Skyplex Skyscraper (Q18378567). Never built; not an Epic Universe ride.
-- See https://en.wikipedia.org/wiki/Skyscraper_(roller_coaster)

delete from coasters
where wikidata_id = 'Q18378567'
  and not exists (select 1 from rides r where r.coaster_id = coasters.id)
  and not exists (select 1 from wishlist w where w.coaster_id = coasters.id)
  and not exists (select 1 from profiles pr where pr.favorite_ride_id = coasters.id);
