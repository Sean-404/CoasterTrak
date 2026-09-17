-- Wikipedia articles that cover mirror copies (Infobox roller coaster/extend)
-- unique-bind one Wikidata Q-id to a single park. Insert the missing siblings
-- without sharing that Q-id, and restore Dominator at Kings Dominion.

-- ---------------------------------------------------------------------------
-- Kings Dominion Dominator is operating; Geauga Lake's retirement is prior life.
-- ---------------------------------------------------------------------------
update coasters
set
  status = 'Operating',
  closing_year = null,
  last_synced_at = now()
where wikidata_id = 'Q951359'
  and name = 'Dominator';

-- ---------------------------------------------------------------------------
-- Operating clones missing because a same-named sibling owns the Wikidata id.
-- ---------------------------------------------------------------------------
insert into coasters (
  park_id, name, coaster_type, manufacturer, status,
  opening_year, height_ft, speed_mph, length_ft, inversions, duration_s,
  rcdb_id, enwiki_title, last_synced_at
)
select
  v.park_id,
  v.name,
  v.coaster_type,
  v.manufacturer,
  'Operating',
  v.opening_year,
  v.height_ft,
  v.speed_mph,
  v.length_ft,
  v.inversions,
  v.duration_s,
  case
    when v.rcdb_id is not null
      and exists (select 1 from coasters c where c.rcdb_id = v.rcdb_id)
    then null
    else v.rcdb_id
  end,
  v.enwiki_title,
  now()
from (
  values
    (
      (select id from parks where name = 'Six Flags Darien Lake' limit 1),
      'Ride of Steel', 'Steel', 'Intamin', 1999, 208, 73, 5400, 0, 122,
      '541'::text, 'Ride of Steel'
    ),
    (
      (select id from parks where name = 'Six Flags Great America' limit 1),
      'Superman: Ultimate Flight', 'Steel', 'Bolliger & Mabillard', 2003, 106, 51, 2769, 2, null::integer,
      '1977'::text, 'Superman: Ultimate Flight'
    ),
    (
      (select id from parks where name = 'Six Flags Great Adventure' limit 1),
      'Superman: Ultimate Flight', 'Steel', 'Bolliger & Mabillard', 2003, 106, 51, 2769, 2, null::integer,
      '1976'::text, 'Superman: Ultimate Flight'
    ),
    (
      (select id from parks where name = 'Six Flags St. Louis' limit 1),
      'Mr. Freeze', 'Steel', 'Premier Rides', 1998, 218, 70, 1300, 1, null::integer,
      null::text, 'Mr. Freeze (roller coaster)'
    ),
    (
      (select id from parks where name = 'Carowinds' limit 1),
      'Hurler', 'Wood', 'International Coasters', 1994, 83, 50, 3157, 0, 120,
      '85'::text, 'Hurler (roller coaster)'
    ),
    (
      (select id from parks where name = 'Universal Studios Japan' limit 1),
      'Flight of the Hippogriff', 'Steel', 'Vekoma', 2014, 43, 29, 1099, 0, 66,
      '11885'::text, 'Flight of the Hippogriff'
    ),
    (
      (select id from parks where name = 'Universal Studios Hollywood' limit 1),
      'Flight of the Hippogriff', 'Steel', 'Mack Rides', 2016, 43, 29, 1099, 0, 66,
      '12812'::text, 'Flight of the Hippogriff'
    ),
    (
      (select id from parks where name = 'Universal Studios Beijing' limit 1),
      'Flight of the Hippogriff', 'Steel', 'Mack Rides', 2021, 43, 29, 1099, 0, 66,
      '17463'::text, 'Flight of the Hippogriff'
    )
) as v(
  park_id, name, coaster_type, manufacturer, opening_year,
  height_ft, speed_mph, length_ft, inversions, duration_s, rcdb_id, enwiki_title
)
where v.park_id is not null
  and not exists (
    select 1 from coasters c
    where c.park_id = v.park_id
      and lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g'))
        = lower(regexp_replace(v.name, '[^a-zA-Z0-9]+', '', 'g'))
  );

insert into data_coaster_field_overrides (coaster_id, field_name, value_text, source, source_url)
select c.id, 'status', 'Operating', 'manual', 'https://en.wikipedia.org/wiki/Dominator_(roller_coaster)'
from coasters c
where c.wikidata_id = 'Q951359'
on conflict (coaster_id, field_name) do update set
  value_text = excluded.value_text,
  source = excluded.source,
  source_url = excluded.source_url,
  approved = true;

insert into data_coaster_name_aliases (key_a, key_b, park_id, source, approved)
select v.key_a, v.key_b, v.park_id, 'seed', true
from (
  values
    (
      'rideofsteel',
      'supermanrideofsteel',
      (select id from parks where name = 'Six Flags Darien Lake' limit 1)
    ),
    (
      'mrfreeze',
      'mrfreezereverseblast',
      (select id from parks where name = 'Six Flags St. Louis' limit 1)
    )
) as v(key_a, key_b, park_id)
where v.park_id is not null
  and not exists (
    select 1 from data_coaster_name_aliases a
    where a.key_a = v.key_a
      and a.key_b = v.key_b
      and a.park_id is not distinct from v.park_id
  );
