-- Fix Knightmare-class park misassigns from wide unlabeled coord snaps,
-- and create missing home parks for those rides.

-- ---------------------------------------------------------------------------
-- Parks
-- ---------------------------------------------------------------------------
insert into parks (name, country, latitude, longitude, external_source, external_id, last_synced_at)
select * from (values
  (
    'Dyrehavsbakken',
    'Denmark',
    55.7758,
    12.5786,
    'wikidata_unknown_park',
    'manual:dyrehavsbakken',
    now()
  ),
  (
    'Luna Park Sydney',
    'Australia',
    -33.84774,
    151.21005,
    'wikidata_unknown_park',
    'manual:luna-park-sydney',
    now()
  ),
  (
    'Nickelodeon Universe American Dream',
    'United States',
    40.8095,
    -74.0684,
    'wikidata_unknown_park',
    'manual:nu-american-dream',
    now()
  )
) as v(name, country, latitude, longitude, external_source, external_id, last_synced_at)
where not exists (
  select 1 from parks p
  where p.external_id = v.external_id
     or lower(p.name) = lower(v.name)
);

insert into parks (name, country, latitude, longitude, external_source, external_id, last_synced_at)
select
  'Camelot Theme Park',
  'United Kingdom',
  53.63528,
  -2.69750,
  'wikidata_unknown_park',
  'manual:camelot-theme-park',
  now()
where not exists (
  select 1 from parks
  where name = 'Camelot Theme Park'
     or external_id = 'manual:camelot-theme-park'
);

-- ---------------------------------------------------------------------------
-- Helper: park id by external_id / name
-- ---------------------------------------------------------------------------
-- Knightmare → Camelot
update coasters c
set
  park_id = p.id,
  status = 'Defunct',
  closing_year = coalesce(c.closing_year, 2012),
  last_synced_at = now()
from parks p
where c.wikidata_id = 'Q13415786'
  and (p.external_id = 'manual:camelot-theme-park' or p.name = 'Camelot Theme Park');

-- Bakken wood coaster + Tornado (were at Tivoli Gardens)
update coasters c
set park_id = p.id, last_synced_at = now()
from parks p
where c.wikidata_id in ('Q10658106', 'Q1415640')
  and (p.external_id = 'manual:dyrehavsbakken' or p.name = 'Dyrehavsbakken');

-- Luna Park Sydney Wild Mouse (was Wonderland Sydney)
update coasters c
set park_id = p.id, last_synced_at = now()
from parks p
where c.wikidata_id = 'Q57522641'
  and (p.external_id = 'manual:luna-park-sydney' or p.name = 'Luna Park Sydney');

-- American Dream Nickelodeon Universe rides
update coasters c
set park_id = p.id, last_synced_at = now()
from parks p
where c.wikidata_id in ('Q87730001', 'Q105095530', 'Q87721534', 'Q74420101')
  and (p.external_id = 'manual:nu-american-dream' or p.name = 'Nickelodeon Universe American Dream');

-- Twister (Gröna Lund) — leave the separate Knoebels Twister QID alone
update coasters c
set park_id = p.id, last_synced_at = now()
from parks p
where c.wikidata_id = 'Q2462361'
  and p.name in ('Gröna Lund', 'Grona Lund');

-- Avatar Airbender → Nickelodeon Universe (Mall of America)
update coasters c
set park_id = p.id, last_synced_at = now()
from parks p
where c.wikidata_id = 'Q4827808'
  and p.name = 'Nickelodeon Universe'
  and p.country ilike 'United States%';

-- Schweizer Bobbahn → Europa-Park
update coasters c
set park_id = p.id, last_synced_at = now()
from parks p
where c.wikidata_id = 'Q319758'
  and p.name = 'Europa-Park';

-- Woodstock Express → Kings Island (drop null-WD stub first: unique(park_id, name))
delete from coasters stub
using coasters keep
where stub.name = 'Woodstock Express'
  and stub.wikidata_id is null
  and stub.park_id = (select id from parks where name = 'Kings Island' limit 1)
  and keep.wikidata_id = 'Q2260635'
  and keep.id <> stub.id;

update coasters
set
  park_id = (select id from parks where name = 'Kings Island' limit 1),
  last_synced_at = now()
where wikidata_id = 'Q2260635'
  and park_id is distinct from (select id from parks where name = 'Kings Island' limit 1);

-- Bulldog Coaster → Brean Leisure Park (drop null-WD stub first)
delete from coasters stub
using coasters keep
where stub.name = 'Bulldog Coaster'
  and stub.wikidata_id is null
  and stub.park_id = (select id from parks where name = 'Brean Leisure Park' limit 1)
  and keep.wikidata_id = 'Q7499849'
  and keep.id <> stub.id;

update coasters
set
  park_id = (select id from parks where name = 'Brean Leisure Park' limit 1),
  last_synced_at = now()
where wikidata_id = 'Q7499849'
  and park_id is distinct from (select id from parks where name = 'Brean Leisure Park' limit 1);

-- Nemesis Reborn: prefer post-retrack Commons image
update coasters
set
  name = 'Nemesis Reborn',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Alton%20Towers%20-%20Nemesis%20Reborn%205-9-2025.jpg',
  last_synced_at = now()
where wikidata_id = 'Q1477806';
