-- Blackpool Big Dipper was showing the Battersea 1972 accident photo, and the
-- disaster Wikipedia article had been imported as if it were a ride.

update public.coasters c
set
  wikidata_id = 'Q265733',
  enwiki_title = 'Big Dipper (Blackpool Pleasure Beach)',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Big%20Dipper%20(Pleasure%20Beach,%20Blackpool)%2002.jpg',
  coaster_type = 'Wood',
  status = 'Operating'
from public.parks p
where c.park_id = p.id
  and c.id = 33
  and c.name ilike 'Big Dipper'
  and c.wikidata_id is null
  and p.name ilike 'Blackpool Pleasure Beach';

update public.coasters
set image_url = null
where image_url is not null
  and image_url ~* '(^|[^a-z0-9])(incident|accident|derailment|collision|crash|explosion|fatal)([^a-z0-9]|$)'
  and image_url !~* 'disaster[_ ]transport';

delete from public.coasters c
where c.wikidata_id = 'Q22000267'
  and not exists (select 1 from public.rides r where r.coaster_id = c.id)
  and not exists (select 1 from public.wishlist w where w.coaster_id = c.id)
  and not exists (select 1 from public.profiles pr where pr.favorite_ride_id = c.id);
