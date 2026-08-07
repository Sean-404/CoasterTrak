-- Fix Universal Orlando catalog duplicates left over from Queue-Times:
-- merge trademark stubs into Wikidata-enriched coasters, repair misplaced rides,
-- and correct Epic Universe longitude (stored in the wrong hemisphere).

create or replace function tmp_coaster_name_key(n text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          replace(replace(replace(coalesce(n, ''), chr(8482), ''), chr(174), ''), chr(169), ''),
          '\s+single\s+rider\s*$',
          '',
          'i'
        ),
        '^the\s+',
        '',
        'i'
      ),
      '[^a-z0-9]+',
      '',
      'g'
    )
  );
$$;

-- Epic Universe is in Florida; positive longitude places it in East Asia.
update parks
set longitude = -abs(longitude)
where name = 'Epic Universe'
  and country ilike 'United States%'
  and longitude is not null
  and longitude > 0;

-- Flight of the Hippogriff (multi-install Wikidata item) belongs at Islands of Adventure.
update coasters c
set
  park_id = p.id,
  duration_s = coalesce(c.duration_s, 66),
  height_ft = coalesce(c.height_ft, 43),
  speed_mph = coalesce(c.speed_mph, 29),
  length_ft = coalesce(c.length_ft, 1099),
  inversions = coalesce(c.inversions, 0),
  coaster_type = case
    when c.coaster_type is null or c.coaster_type = 'Unknown' then 'Steel'
    else c.coaster_type
  end,
  status = coalesce(nullif(c.status, 'Unknown'), 'Operating')
from parks p
where p.name = 'Universal''s Islands of Adventure'
  and c.wikidata_id = 'Q3073731';

-- Revenge of the Mummy (Orlando layout) was parked under placeholder "Other".
update coasters c
set
  park_id = p.id,
  height_ft = coalesce(c.height_ft, 44),
  speed_mph = coalesce(c.speed_mph, 40),
  length_ft = coalesce(c.length_ft, 2200),
  inversions = coalesce(c.inversions, 0),
  duration_s = coalesce(c.duration_s, 180),
  manufacturer = coalesce(c.manufacturer, 'Premier Rides'),
  coaster_type = case
    when c.coaster_type is null or c.coaster_type = 'Unknown' then 'Steel'
    else c.coaster_type
  end,
  status = coalesce(nullif(c.status, 'Unknown'), 'Operating')
from parks p
where p.name = 'Universal Studios Florida'
  and c.wikidata_id = 'Q21051432';

-- Pteranodon Flyers belongs at Islands of Adventure (was on a geocode junk park).
update coasters c
set
  park_id = p.id,
  coaster_type = 'Steel',
  status = 'Operating',
  height_ft = coalesce(c.height_ft, 65),
  speed_mph = coalesce(c.speed_mph, 20),
  length_ft = coalesce(c.length_ft, 800),
  duration_s = coalesce(c.duration_s, 88),
  inversions = coalesce(c.inversions, 0),
  manufacturer = coalesce(c.manufacturer, 'Setpoint')
from parks p
where p.name = 'Universal''s Islands of Adventure'
  and tmp_coaster_name_key(c.name) = 'pteranodonflyers'
  and (c.wikidata_id is null or c.wikidata_id = '');

-- Cancelled Skyscraper was wrongly attached to Volcano Bay (water park).
update coasters c
set
  park_id = p.id,
  status = 'Defunct'
from parks p
where p.name = 'Epic Universe'
  and c.wikidata_id = 'Q18378567';

-- Epic / Studios coasters that exist only as Queue-Times stubs still need a coaster type.
update coasters
set
  coaster_type = 'Steel',
  name = replace(replace(name, chr(8482), ''), chr(174), ''),
  status = coalesce(nullif(status, 'Unknown'), 'Operating'),
  duration_s = coalesce(duration_s, 180)
where tmp_coaster_name_key(name) in ('minecartmadness', 'minecartmadnesssinglerider')
  and park_id = (select id from parks where name = 'Epic Universe' limit 1);

update coasters c
set
  park_id = p.id,
  coaster_type = 'Steel',
  status = 'Operating',
  name = replace(replace(c.name, chr(8482), ''), chr(174), '')
from parks p
where p.name = 'Universal Studios Florida'
  and tmp_coaster_name_key(c.name) = 'trollstrollercoaster';

-- Pair Queue-Times trademark stubs with enriched Wikidata rows, then remap user data.
with canon_parks as (
  select id, name
  from parks
  where name in (
    'Universal''s Islands of Adventure',
    'Universal Studios Florida',
    'Epic Universe'
  )
),
qt_parks as (
  select id, name
  from parks
  where name in (
    'Islands Of Adventure At Universal Orlando',
    'Universal Studios At Universal Orlando'
  )
),
stubs as (
  select
    c.id,
    c.park_id,
    tmp_coaster_name_key(c.name) as nkey
  from coasters c
  join qt_parks qp on qp.id = c.park_id
),
keeps as (
  select
    c.id,
    c.park_id,
    c.wikidata_id,
    tmp_coaster_name_key(c.name) as nkey,
    p.name as park_name
  from coasters c
  join canon_parks p on p.id = c.park_id
),
pairs as (
  select distinct on (s.id)
    s.id as stub_id,
    k.id as keep_id
  from stubs s
  join keeps k
    on (
      k.nkey = s.nkey
      or (s.nkey = 'jurassicworldvelocicoaster' and k.nkey = 'velocicoaster')
      or (s.nkey like 'hagrids%' and k.nkey like 'hagrids%')
      or (s.nkey like 'incrediblehulk%' and k.nkey like 'incrediblehulk%')
      or (
        s.nkey like 'harrypotterandtheescapefromgringotts%'
        and k.nkey like 'harrypotterandtheescapefromgringotts%'
      )
      or (s.nkey like 'hollywoodripriderockit%' and k.nkey like 'hollywoodripriderockit%')
      or (s.nkey like 'revengeofthemummy%' and k.wikidata_id = 'Q21051432')
      or (s.nkey = 'flightofthehippogriff' and k.wikidata_id = 'Q3073731')
      or (s.nkey = 'pteranodonflyers' and k.nkey = 'pteranodonflyers')
      or (s.nkey like 'stardustracers%' and k.nkey = 'stardustracers')
    )
  order by
    s.id,
    case when k.wikidata_id is not null then 0 else 1 end,
    k.id
),
del_conflict_rides as (
  delete from rides r
  using pairs p
  where r.coaster_id = p.stub_id
    and exists (
      select 1
      from rides r2
      where r2.user_id = r.user_id
        and r2.coaster_id = p.keep_id
    )
  returning r.id
),
upd_rides as (
  update rides r
  set coaster_id = p.keep_id
  from pairs p
  where r.coaster_id = p.stub_id
  returning r.id
),
del_conflict_wishlist as (
  delete from wishlist w
  using pairs p
  where w.coaster_id = p.stub_id
    and exists (
      select 1
      from wishlist w2
      where w2.user_id = w.user_id
        and w2.coaster_id = p.keep_id
    )
  returning w.user_id
),
upd_wishlist as (
  update wishlist w
  set coaster_id = p.keep_id
  from pairs p
  where w.coaster_id = p.stub_id
  returning w.user_id
),
upd_fav_rides as (
  update profiles pr
  set favorite_ride_id = p.keep_id
  from pairs p
  where pr.favorite_ride_id = p.stub_id
  returning pr.user_id
),
del_stubs as (
  delete from coasters c
  using pairs p
  where c.id = p.stub_id
  returning c.id
)
select
  (select count(*) from pairs) as paired,
  (select count(*) from del_stubs) as deleted_stubs;

-- Move leftover Queue-Times rows onto the canonical Wikidata parks.
update coasters c
set park_id = p.id
from parks p
where p.name = 'Universal''s Islands of Adventure'
  and c.park_id = (
    select id from parks where name = 'Islands Of Adventure At Universal Orlando' limit 1
  );

update coasters c
set park_id = p.id
from parks p
where p.name = 'Universal Studios Florida'
  and c.park_id = (
    select id from parks where name = 'Universal Studios At Universal Orlando' limit 1
  );

-- Point favorite-park profiles at the surviving parks before deleting duplicates.
update profiles pr
set favorite_park_id = p.id
from parks p
where p.name = 'Universal''s Islands of Adventure'
  and pr.favorite_park_id = (
    select id from parks where name = 'Islands Of Adventure At Universal Orlando' limit 1
  );

update profiles pr
set favorite_park_id = p.id
from parks p
where p.name = 'Universal Studios Florida'
  and pr.favorite_park_id = (
    select id from parks where name = 'Universal Studios At Universal Orlando' limit 1
  );

update profiles pr
set favorite_park_id = p.id
from parks p
where p.name = 'Universal''s Islands of Adventure'
  and pr.favorite_park_id = (
    select id
    from parks
    where name = 'Universal Orlando Resort, Orlando, Florida, United States'
    limit 1
  );

-- Drop emptied Queue-Times / geocode park shells.
delete from parks p
where p.name in (
  'Islands Of Adventure At Universal Orlando',
  'Universal Studios At Universal Orlando',
  'Universal Orlando Resort, Orlando, Florida, United States'
)
and not exists (select 1 from coasters c where c.park_id = p.id);

drop function if exists tmp_coaster_name_key(text);
