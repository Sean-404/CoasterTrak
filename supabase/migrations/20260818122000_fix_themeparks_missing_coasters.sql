-- Fix ThemeParks admin "missing coaster" queue: stolen park links, name aliases,
-- and catalog gaps for operating rides that never imported from Wikidata.

-- ---------------------------------------------------------------------------
-- Reassign ThemeParks park entities that landed on the wrong catalog park.
-- ---------------------------------------------------------------------------
delete from data_park_source_links
where source = 'themeparks_wiki'
  and park_id in (107, 155, 216, 218);

insert into data_park_source_links (
  park_id, source, external_id, external_name, match_method, confidence, last_verified_at
)
select 115, 'themeparks_wiki', '15805a4d-4023-4702-b9f2-3d3cab2e0c1e', 'Six Flags Great America', 'auto', 1, now()
where not exists (
  select 1 from data_park_source_links
  where source = 'themeparks_wiki'
    and (park_id = 115 or external_id = '15805a4d-4023-4702-b9f2-3d3cab2e0c1e')
);

insert into data_park_source_links (
  park_id, source, external_id, external_name, match_method, confidence, last_verified_at
)
select 98, 'themeparks_wiki', 'b08d9272-d070-4580-9fcd-375270b191a7', 'Thorpe Park', 'auto', 1, now()
where not exists (
  select 1 from data_park_source_links
  where source = 'themeparks_wiki'
    and (park_id = 98 or external_id = 'b08d9272-d070-4580-9fcd-375270b191a7')
);

-- Wikidata umbrella rows sitting on park "Other" with no user credits.
update coasters
set park_id = 115
where id = 829
  and park_id = 8
  and not exists (
    select 1 from coasters c
    where c.park_id = 115
      and lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g')) like '%darkknight%'
  );

update coasters
set park_id = 70
where id = 1094
  and park_id = 8
  and not exists (
    select 1 from coasters c
    where c.park_id = 70
      and lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g')) = 'thejoker'
  );

-- Kings Island retheme (feed name).
update coasters
set name = 'Queen City Stunt Coaster'
where id = 823
  and park_id = 67
  and name = 'Backlot Stunt Coaster'
  and not exists (
    select 1 from coasters c where c.park_id = 67 and c.name = 'Queen City Stunt Coaster'
  );

-- ---------------------------------------------------------------------------
-- Catalog inserts for operating rides missing from Wikidata import.
-- ---------------------------------------------------------------------------
insert into coasters (park_id, name, coaster_type, manufacturer, status, opening_year, wikidata_id)
select v.park_id, v.name, v.coaster_type, v.manufacturer, 'Operating', v.opening_year, v.wikidata_id
from (
  values
    (87, 'Backlot Stunt Coaster', 'Steel', 'Premier Rides', 2005, null),
    (107, 'The Joker', 'Steel', 'S&S – Sansei Technologies', 2019, null),
    (115, 'The Joker', 'Steel', 'S&S – Sansei Technologies', 2017, null),
    (70, 'The Dark Knight Coaster', 'Steel', 'Mack Rides', 2008, null),
    (56, 'The Joker', 'Steel', 'S&S – Sansei Technologies', 2017, null),
    (43, 'The Joker', 'Steel', 'S&S – Sansei Technologies', 2017, null),
    (304, 'T-Rex Family Coaster', 'Steel', null, null, null),
    (266, 'Circus Coaster', 'Steel', null, null, null),
    (4, 'Nia and Animal Coaster', 'Steel', null, null, null),
    (306, 'Cornwall Coaster', 'Steel', null, 2025, null),
    (72, 'Great Pumpkin Coaster', 'Steel', null, null, null),
    (67, 'The Great Pumpkin Coaster', 'Steel', null, null, null),
    (80, 'Snoopy''s Tenderpaw Twister Coaster', 'Steel', null, 2024, null),
    (296, 'Coastersaurus', 'Wood', null, null, null),
    (300, 'DUPLO Dino Coaster', 'Steel', null, null, null),
    (279, 'Cat-O-Pillar Coaster', 'Steel', null, null, null),
    (313, '#LikeMe Coaster', 'Steel', null, 2023, null),
    (344, 'Big Thunder Mountain', 'Steel', 'Vekoma', 1987, null),
    (206, 'Flounder''s Flying Fish Coaster', 'Steel', null, 2001, 'Q2358448')
) as v(park_id, name, coaster_type, manufacturer, opening_year, wikidata_id)
where not exists (
  select 1 from coasters c
  where c.park_id = v.park_id
    and lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g'))
      = lower(regexp_replace(v.name, '[^a-zA-Z0-9]+', '', 'g'))
)
and (
  v.wikidata_id is null
  or not exists (
    select 1 from coasters c where c.wikidata_id = v.wikidata_id
  )
);

-- ---------------------------------------------------------------------------
-- Name aliases the matcher cannot infer from decorations alone.
-- key_a < key_b is required.
-- ---------------------------------------------------------------------------
insert into data_coaster_name_aliases (key_a, key_b, park_id, source, approved)
select v.key_a, v.key_b, v.park_id, 'seed', true
from (
  values
    ('hyperion', 'pepsihyperion', 266),
    ('chipndalesgadgetcoaster', 'gadgetsgocoaster', 344),
    ('backlotstuntcoaster', 'queencitystuntcoaster', 67)
) as v(key_a, key_b, park_id)
where not exists (
  select 1 from data_coaster_name_aliases a
  where a.key_a = v.key_a
    and a.key_b = v.key_b
    and a.park_id is not distinct from v.park_id
);

-- Stale unmatched-attraction findings came from the wrong park links / names.
update data_review_findings
set status = 'resolved', resolved_at = now()
where status = 'open'
  and finding_type = 'source_attraction_unmatched';
