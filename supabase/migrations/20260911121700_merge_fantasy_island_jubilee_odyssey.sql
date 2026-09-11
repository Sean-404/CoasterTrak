-- Fantasy Island (UK): "Jubilee Odyssey" is the former name of "The Odyssey"
-- (Q1710760). A Wikipedia-enriched stub without Wikidata sat beside the real row
-- with the same stats/image, splitting user credits.

alter table coasters disable trigger trg_guard_unique_wikidata_binding;

drop table if exists tmp_coaster_merges;
create table tmp_coaster_merges (
  stub_id bigint primary key,
  keep_id bigint not null
);

insert into tmp_coaster_merges (stub_id, keep_id)
select stub.id, keep.id
from coasters stub
join coasters keep
  on keep.park_id = stub.park_id
 and keep.wikidata_id = 'Q1710760'
join parks p on p.id = stub.park_id
where stub.name = 'Jubilee Odyssey'
  and stub.wikidata_id is null
  and keep.name = 'The Odyssey'
  and p.name ilike 'Fantasy Island';

-- Copy any stub-only enrichment onto the surviving Wikidata row.
update coasters k
set
  manufacturer = coalesce(k.manufacturer, s.manufacturer),
  image_url = coalesce(k.image_url, s.image_url),
  enwiki_title = coalesce(k.enwiki_title, s.enwiki_title),
  summary_text = coalesce(k.summary_text, s.summary_text),
  height_ft = coalesce(k.height_ft, s.height_ft),
  speed_mph = coalesce(k.speed_mph, s.speed_mph),
  length_ft = coalesce(k.length_ft, s.length_ft),
  inversions = coalesce(k.inversions, s.inversions),
  duration_s = coalesce(k.duration_s, s.duration_s),
  opening_year = coalesce(k.opening_year, s.opening_year),
  closing_year = coalesce(k.closing_year, s.closing_year),
  rcdb_id = coalesce(k.rcdb_id, s.rcdb_id),
  last_synced_at = now()
from tmp_coaster_merges m
join coasters s on s.id = m.stub_id
where k.id = m.keep_id;

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

-- Prevent ThemeParks / feed matching from recreating the former-name stub.
insert into data_coaster_name_aliases (key_a, key_b, park_id, source, approved)
select least(v.key_a, v.key_b), greatest(v.key_a, v.key_b), v.park_id, 'manual', true
from (
  values
    ('jubileeodyssey', 'odyssey', 170::bigint)
) as v(key_a, key_b, park_id)
where exists (select 1 from parks where id = v.park_id and name ilike 'Fantasy Island')
  and not exists (
    select 1
    from data_coaster_name_aliases a
    where a.key_a = least(v.key_a, v.key_b)
      and a.key_b = greatest(v.key_a, v.key_b)
      and a.park_id is not distinct from v.park_id
  );

drop table if exists tmp_coaster_merges;

alter table coasters enable trigger trg_guard_unique_wikidata_binding;
