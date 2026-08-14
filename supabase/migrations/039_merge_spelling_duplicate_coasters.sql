-- Merge same-park spelling / punctuation duplicate coasters (ThemeParks stubs
-- vs Wikidata rows), and move Kentucky Kingdom's Woodland Run off Canada's Wonderland.
-- Disable the Wikidata uniqueness trigger: stubs can bind the Q-id via both
-- wikidata_id and external_id, so copying onto keep would otherwise fail.

alter table coasters disable trigger trg_guard_unique_wikidata_binding;

drop table if exists tmp_coaster_merges;
create table tmp_coaster_merges (
  stub_id bigint primary key,
  keep_id bigint not null
);

insert into tmp_coaster_merges (stub_id, keep_id) values
  -- Canada's Wonderland
  (14613, 186),   -- Dragon Fire → Dragon Fyre
  (14678, 193),   -- Wild Beast → Wilde Beast
  (192, 300),     -- Woodland Run (misfiled at CW) → Kentucky Kingdom Woodland Run
  -- Other parks: spelling, punctuation, translation, or ALL-CAPS twins
  (14608, 251),   -- Dream Catcher → Dreamcatcher
  (14585, 470),   -- Vogelrok → Vogel Rok
  (14676, 390),   -- Space Shuttle Max stub → Space Shuttle
  (14566, 4388),  -- Dodonpa → Do-Dodonpa
  (14631, 471),   -- Volcano, The Blast Coaster → Volcano: The Blast Coaster
  (14551, 1397),  -- Krampus Expedition → Krampus Expédition
  (437, 5151),    -- Tonnerre de Zeus → Tonnerre 2 Zeus
  (8962, 14563),  -- BATMAN GOTHAM CITY ESCAPE → Batman Gotham City Escape
  (9069, 14689),  -- STUNT FALL → Stunt Fall
  (9929, 523),    -- Batman The Ride → Batman: The Ride
  (10106, 786),   -- Hollywood Dream ASCII dash → Hollywood Dream – The Ride
  (5204, 14674);  -- zero-width Drako → Drako

-- Copy missing enrichment onto the surviving row before deleting stubs.
update coasters k
set
  wikidata_id = coalesce(k.wikidata_id, s.wikidata_id),
  external_source = coalesce(k.external_source, s.external_source),
  external_id = coalesce(k.external_id, s.external_id),
  manufacturer = coalesce(k.manufacturer, s.manufacturer),
  image_url = coalesce(k.image_url, s.image_url),
  enwiki_title = coalesce(k.enwiki_title, s.enwiki_title),
  summary_text = coalesce(k.summary_text, s.summary_text),
  opening_year = coalesce(k.opening_year, s.opening_year),
  closing_year = coalesce(k.closing_year, s.closing_year)
from tmp_coaster_merges m
join coasters s on s.id = m.stub_id
where k.id = m.keep_id;

-- Ride events: add quantities when the keep row already has that day, then remap the rest.
update ride_events keep
set quantity = least(99, keep.quantity + stub.quantity)
from ride_events stub
join tmp_coaster_merges m on stub.coaster_id = m.stub_id
where keep.user_id = stub.user_id
  and keep.coaster_id = m.keep_id
  and keep.ridden_on is not distinct from stub.ridden_on
  and keep.id <> stub.id;

delete from ride_events stub
using tmp_coaster_merges m
where stub.coaster_id = m.stub_id
  and exists (
    select 1
    from ride_events keep
    where keep.user_id = stub.user_id
      and keep.coaster_id = m.keep_id
      and keep.ridden_on is not distinct from stub.ridden_on
  );

update ride_events stub
set coaster_id = m.keep_id
from tmp_coaster_merges m
where stub.coaster_id = m.stub_id;

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

delete from data_coaster_field_overrides o
using tmp_coaster_merges m
where o.coaster_id = m.stub_id
  and exists (
    select 1 from data_coaster_field_overrides o2
    where o2.coaster_id = m.keep_id and o2.field_name = o.field_name
  );

update data_coaster_field_overrides o
set coaster_id = m.keep_id
from tmp_coaster_merges m
where o.coaster_id = m.stub_id;

update data_review_findings f
set coaster_id = m.keep_id
from tmp_coaster_merges m
where f.coaster_id = m.stub_id;

delete from coasters c
using tmp_coaster_merges m
where c.id = m.stub_id;

-- Official / current names
update coasters set name = 'The Fly' where id = 14637 and name = 'DareDeviler';
update coasters set name = 'Space Shuttle Max' where id = 390;

-- Canada's Wonderland Thunder Run had Kentucky Kingdom Thunder Run stats attached.
update coasters
set
  height_ft = 33,
  speed_mph = 40,
  length_ft = 1080,
  duration_s = 84,
  manufacturer = coalesce(manufacturer, 'Mack Rides'),
  coaster_type = 'Steel',
  status = 'Operating'
where id = 15500;

-- key_a < key_b is required by data_coaster_name_aliases_distinct.
-- Unique (key_a, key_b, park_id) does not match NULL park_id, so use NOT EXISTS.
insert into data_coaster_name_aliases (key_a, key_b, park_id, source)
select least(v.key_a, v.key_b), greatest(v.key_a, v.key_b), v.park_id, 'manual'
from (
  values
    ('dragonfire', 'dragonfyre', 87::bigint),
    ('wildbeast', 'wildebeast', 87),
    ('dododonpa', 'dodonpa', null),
    ('spaceshuttle', 'spaceshuttlemax', null),
    ('tonnerre2zeus', 'tonnerredezeus', null),
    ('daredeviler', 'thefly', 87)
) as v(key_a, key_b, park_id)
where not exists (
  select 1
  from data_coaster_name_aliases a
  where a.key_a = least(v.key_a, v.key_b)
    and a.key_b = greatest(v.key_a, v.key_b)
    and a.park_id is not distinct from v.park_id
);

drop table if exists tmp_coaster_merges;

alter table coasters enable trigger trg_guard_unique_wikidata_binding;

notify pgrst, 'reload schema';
