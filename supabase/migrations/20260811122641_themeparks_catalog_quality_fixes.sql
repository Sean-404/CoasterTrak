-- CoasterTrak Data: catalog quality fixes from ThemeParks.wiki Phase 1 review.
-- Merges renamed duplicates, corrects statuses, fills missing Disneyland Big Thunder,
-- and expands match_method values for the data platform linker.

-- Allow alias / prefix match methods from the improved matcher.
alter table data_coaster_source_links
  drop constraint if exists data_coaster_source_links_match_method_check;

alter table data_coaster_source_links
  add constraint data_coaster_source_links_match_method_check
  check (match_method in ('exact_key', 'alias', 'fuzzy', 'prefix', 'manual'));

-- ---------------------------------------------------------------------------
-- Remap user data from stub coaster → canonical keep, then delete stubs.
-- ---------------------------------------------------------------------------
create temporary table tmp_coaster_merges (
  stub_id bigint primary key,
  keep_id bigint not null
) on commit drop;

insert into tmp_coaster_merges (stub_id, keep_id) values
  -- Disney California Adventure
  (571, 583),   -- California Screamin' → Incredicoaster
  (587, 581),   -- Mulholland Madness → Goofy's Sky School
  -- Blackpool
  (63, 962),    -- Zipper Dipper → Blue Flyer
  -- Cedar Point
  (4376, 4542), -- Top Thrill Dragster → Top Thrill 2
  (14561, 4542),-- Q1189847 placeholder → Top Thrill 2
  -- Magic Kingdom
  (411, 397),   -- Barnstormer long title → The Barnstormer
  -- Europa-Park duplicates
  (14657, 5),   -- Blue Fire Megacoaster → Blue Fire
  (5252, 5),    -- blue fire Megacoaster → Blue Fire
  (14592, 4383),-- Arthur → Arthur – The Ride
  (5261, 4383), -- ARTHUR → Arthur – The Ride
  (5254, 14654),-- WODAN → Wodan - Timburcoaster
  (4387, 14654),-- Wodan Timbur Coaster → Wodan - Timburcoaster
  (14682, 4385),-- Eurosat → Eurosat - CanCan Coaster
  -- Phantasialand
  (14647, 268), -- Temple of the Night Hawk → Crazy Bats
  -- Six Flags Magic Mountain
  (14670, 643), -- Scream! → Scream
  -- Hollywood Studios retheme (Aerosmith → Muppets)
  (15611, 15653);

-- Drop conflicting rides/wishlist before remapping.
delete from rides r
using tmp_coaster_merges m
where r.coaster_id = m.stub_id
  and exists (
    select 1 from rides r2
    where r2.user_id = r.user_id and r2.coaster_id = m.keep_id
  );

update rides r
set coaster_id = m.keep_id
from tmp_coaster_merges m
where r.coaster_id = m.stub_id;

delete from wishlist w
using tmp_coaster_merges m
where w.coaster_id = m.stub_id
  and exists (
    select 1 from wishlist w2
    where w2.user_id = w.user_id and w2.coaster_id = m.keep_id
  );

update wishlist w
set coaster_id = m.keep_id
from tmp_coaster_merges m
where w.coaster_id = m.stub_id;

update profiles p
set favorite_ride_id = m.keep_id
from tmp_coaster_merges m
where p.favorite_ride_id = m.stub_id;

-- Move ThemeParks links off stubs when keep has none.
update data_coaster_source_links d
set coaster_id = m.keep_id
from tmp_coaster_merges m
where d.coaster_id = m.stub_id
  and not exists (
    select 1 from data_coaster_source_links d2
    where d2.coaster_id = m.keep_id and d2.source = d.source
  );

delete from data_coaster_source_links d
using tmp_coaster_merges m
where d.coaster_id = m.stub_id;

update data_review_findings f
set coaster_id = m.keep_id
from tmp_coaster_merges m
where f.coaster_id = m.stub_id;

delete from coasters c
using tmp_coaster_merges m
where c.id = m.stub_id;

-- ---------------------------------------------------------------------------
-- Canonical renames / status corrections (keep historical rows as Defunct)
-- ---------------------------------------------------------------------------

-- Goofy's Sky School / Blue Flyer / Twisted Colossus / Phantasialand ops
update coasters set status = 'Operating', name = 'Goofy''s Sky School'
where id = 581;

update coasters set status = 'Operating', name = 'Blue Flyer', wikidata_id = coalesce(wikidata_id, 'Q885702')
where id = 962;

update coasters set status = 'Operating', name = 'Twisted Colossus'
where id = 1207;

update coasters set status = 'Operating' where id in (268, 1376, 1233, 1241); -- Crazy Bats, F.L.Y., Raik, Taron

update coasters set name = 'Chip ''n'' Dale''s GADGETcoaster', status = 'Operating'
where id = 10483;

update coasters set name = 'Apocalypse', status = 'Operating' where id = 874;

update coasters set name = 'Arthur', status = 'Operating' where id = 4383;

update coasters set name = 'WODAN - Timburcoaster', status = 'Operating' where id = 14654;

update coasters set name = 'Eurosat - CanCan Coaster', status = 'Operating' where id = 4385;

update coasters set name = 'Voltron Nevera powered by Rimac', status = 'Operating' where id = 15569;

update coasters set name = 'Alpine Express ''Enzian''', status = 'Operating', coaster_type = 'Steel'
where id = 4382;

update coasters set
  name = 'Rock ''n'' Roller Coaster Starring The Muppets',
  status = 'Operating'
where id = 15653;

update coasters set name = 'The Barnstormer', status = 'Operating' where id = 397;

update coasters set name = 'Expedition Everest - Legend of the Forbidden Mountain', status = 'Operating'
where id = 739;

-- Historical rethemes / removals wrongly still Operating
update coasters set status = 'Defunct' where id = 14556; -- Mantis → Rougarou
update coasters set status = 'Defunct' where id = 15669; -- Mean Streak → Steel Vengeance
update coasters set status = 'Defunct', name = 'Colossus' where id = 154;
update coasters set status = 'Defunct', name = 'Beast' where id = 265; -- Alton Towers
update coasters set status = 'Defunct', name = 'Grand-Canyon-Bahn' where id = 14600;
update coasters set status = 'Defunct', name = 'Gebirgsbahn' where id = 14596; -- Q1497026 fire loss
update coasters set status = 'Defunct' where id = 480; -- Canyon Blaster

-- Europa-Park Poseidon: keep short display name (matcher aliases cover feed title)
update coasters set status = 'Operating', name = 'Poseidon' where id = 14644;
update coasters set status = 'Operating', name = 'Blue Fire' where id = 5;
update coasters set status = 'Operating' where id = 4542; -- Top Thrill 2
update coasters set status = 'Operating' where id = 4375; -- Rougarou
update coasters set status = 'Operating' where id = 4; -- Steel Vengeance
update coasters set status = 'Operating' where id = 643; -- Scream
update coasters set status = 'Operating' where id = 583; -- Incredicoaster

-- ---------------------------------------------------------------------------
-- Missing Disneyland coaster from ThemeParks.wiki feed
-- ---------------------------------------------------------------------------
insert into coasters (
  park_id, name, coaster_type, manufacturer, status,
  external_source, external_id, wikidata_id, opening_year
)
select
  78,
  'Big Thunder Mountain Railroad',
  'Steel',
  'Walt Disney Imagineering',
  'Operating',
  'wikidata',
  'Q859471',
  'Q859471',
  1979
where not exists (
  select 1 from coasters c
  where c.park_id = 78
    and lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g')) like '%bigthunder%'
);
