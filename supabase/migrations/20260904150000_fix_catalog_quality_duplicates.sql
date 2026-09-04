-- Catalog quality report (2026-09-02): merge clear park-name aliases and
-- the remaining Hollywood Dream dash stub. Skip false positives
-- (PortAventura/Ferrari Land, Islands/USF, Beast/Beastie, etc.).

alter table coasters disable trigger trg_guard_unique_wikidata_binding;

-- ---------------------------------------------------------------------------
-- 1) Same-park coaster stub: Hollywood Dream ASCII dash twin
-- ---------------------------------------------------------------------------
drop table if exists tmp_coaster_merges;
create table tmp_coaster_merges (
  stub_id bigint primary key,
  keep_id bigint not null
);

insert into tmp_coaster_merges (stub_id, keep_id) values
  (10117, 786); -- Hollywood Dream - The Ride → Hollywood Dream – The Ride

update coasters k
set
  wikidata_id = coalesce(k.wikidata_id, s.wikidata_id),
  external_source = coalesce(k.external_source, s.external_source),
  external_id = coalesce(k.external_id, s.external_id),
  manufacturer = coalesce(k.manufacturer, s.manufacturer),
  image_url = coalesce(k.image_url, s.image_url),
  height_ft = coalesce(k.height_ft, s.height_ft),
  speed_mph = coalesce(k.speed_mph, s.speed_mph),
  length_ft = coalesce(k.length_ft, s.length_ft),
  inversions = coalesce(k.inversions, s.inversions),
  duration_s = coalesce(k.duration_s, s.duration_s),
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
    select 1 from ride_events keep
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

delete from data_coaster_source_links d
using tmp_coaster_merges m
where d.coaster_id = m.stub_id
  and exists (
    select 1 from data_coaster_source_links d2
    where d2.coaster_id = m.keep_id and d2.source = d.source
  );

update data_coaster_source_links d
set coaster_id = m.keep_id
from tmp_coaster_merges m
where d.coaster_id = m.stub_id;

update data_review_findings f
set coaster_id = m.keep_id
from tmp_coaster_merges m
where f.coaster_id = m.stub_id;

delete from coasters c
using tmp_coaster_merges m
where c.id = m.stub_id;

-- ---------------------------------------------------------------------------
-- 2) Park alias merges (keep, drop, display name, country override)
-- ---------------------------------------------------------------------------
drop table if exists tmp_park_merges;
create table tmp_park_merges (
  keep_id bigint primary key,
  drop_id bigint not null unique,
  keep_name text not null,
  keep_country text
);

insert into tmp_park_merges (keep_id, drop_id, keep_name, keep_country) values
  (12, 236, 'Kennywood', null),
  (18, 200, 'Clementon Park', null),
  (26, 285, 'Dorney Park', null),
  (49, 307, 'Knoebels', null),
  (82, 311, 'Adventureland (Iowa)', null),
  (320, 90, 'La Ronde', null),
  (91, 220, 'Sea World', null),
  (114, 305, 'Gröna Lund', null),
  (170, 189, 'Fantasy Island', null),
  (283, 254, 'Fårup Sommerland', null),
  (253, 250, 'Imagicaa', null),
  (258, 287, 'Chimelong Ocean Kingdom', null),
  (314, 185, 'Plopsaland Deutschland', null),
  (321, 99, 'Great Escape', 'United States');

update parks p
set
  name = m.keep_name,
  country = coalesce(m.keep_country, p.country),
  last_synced_at = now()
from tmp_park_merges m
where p.id = m.keep_id
  and (
    p.name is distinct from m.keep_name
    or (m.keep_country is not null and p.country is distinct from m.keep_country)
  );

-- Coaster pairs that collide by normalized name across keep/drop parks.
drop table if exists tmp_park_coaster_merges;
create table tmp_park_coaster_merges (
  stub_id bigint primary key,
  keep_id bigint not null
);

insert into tmp_park_coaster_merges (stub_id, keep_id)
select distinct on (drop_c.id)
  drop_c.id as stub_id,
  keep_c.id as keep_id
from tmp_park_merges m
join coasters drop_c on drop_c.park_id = m.drop_id
join coasters keep_c on keep_c.park_id = m.keep_id
where lower(regexp_replace(trim(drop_c.name), '[^a-z0-9]+', '', 'g'))
    = lower(regexp_replace(trim(keep_c.name), '[^a-z0-9]+', '', 'g'))
order by
  drop_c.id,
  (keep_c.wikidata_id is not null) desc,
  (keep_c.height_ft is not null) desc,
  keep_c.id;

-- Prefer richer stub fields onto keep before delete.
update coasters k
set
  wikidata_id = coalesce(k.wikidata_id, s.wikidata_id),
  external_source = coalesce(k.external_source, s.external_source),
  external_id = coalesce(k.external_id, s.external_id),
  manufacturer = coalesce(k.manufacturer, s.manufacturer),
  image_url = coalesce(k.image_url, s.image_url),
  height_ft = coalesce(k.height_ft, s.height_ft),
  speed_mph = coalesce(k.speed_mph, s.speed_mph),
  length_ft = coalesce(k.length_ft, s.length_ft),
  inversions = coalesce(k.inversions, s.inversions),
  duration_s = coalesce(k.duration_s, s.duration_s),
  opening_year = coalesce(k.opening_year, s.opening_year),
  closing_year = coalesce(k.closing_year, s.closing_year),
  status = coalesce(nullif(trim(k.status), ''), s.status),
  last_synced_at = now()
from tmp_park_coaster_merges m
join coasters s on s.id = m.stub_id
where k.id = m.keep_id;

update ride_events keep
set quantity = least(99, keep.quantity + stub.quantity)
from ride_events stub
join tmp_park_coaster_merges m on stub.coaster_id = m.stub_id
where keep.user_id = stub.user_id
  and keep.coaster_id = m.keep_id
  and keep.ridden_on is not distinct from stub.ridden_on
  and keep.id <> stub.id;

delete from ride_events stub
using tmp_park_coaster_merges m
where stub.coaster_id = m.stub_id
  and exists (
    select 1 from ride_events keep
    where keep.user_id = stub.user_id
      and keep.coaster_id = m.keep_id
      and keep.ridden_on is not distinct from stub.ridden_on
  );

update ride_events stub
set coaster_id = m.keep_id
from tmp_park_coaster_merges m
where stub.coaster_id = m.stub_id;

delete from rides r
using tmp_park_coaster_merges m
where r.coaster_id = m.stub_id
  and exists (
    select 1 from rides r2
    where r2.user_id = r.user_id and r2.coaster_id = m.keep_id
  );

update rides r
set coaster_id = m.keep_id
from tmp_park_coaster_merges m
where r.coaster_id = m.stub_id;

delete from wishlist w
using tmp_park_coaster_merges m
where w.coaster_id = m.stub_id
  and exists (
    select 1 from wishlist w2
    where w2.user_id = w.user_id and w2.coaster_id = m.keep_id
  );

update wishlist w
set coaster_id = m.keep_id
from tmp_park_coaster_merges m
where w.coaster_id = m.stub_id;

update profiles p
set favorite_ride_id = m.keep_id
from tmp_park_coaster_merges m
where p.favorite_ride_id = m.stub_id;

delete from data_coaster_source_links d
using tmp_park_coaster_merges m
where d.coaster_id = m.stub_id
  and exists (
    select 1 from data_coaster_source_links d2
    where d2.coaster_id = m.keep_id and d2.source = d.source
  );

update data_coaster_source_links d
set coaster_id = m.keep_id
from tmp_park_coaster_merges m
where d.coaster_id = m.stub_id;

update data_review_findings f
set coaster_id = m.keep_id
from tmp_park_coaster_merges m
where f.coaster_id = m.stub_id;

delete from coasters c
using tmp_park_coaster_merges m
where c.id = m.stub_id;

-- Move remaining drop-park coasters onto keep park.
update coasters c
set park_id = m.keep_id,
    last_synced_at = now()
from tmp_park_merges m
where c.park_id = m.drop_id
  and not exists (
    select 1 from coasters other
    where other.park_id = m.keep_id
      and lower(regexp_replace(trim(other.name), '[^a-z0-9]+', '', 'g'))
        = lower(regexp_replace(trim(c.name), '[^a-z0-9]+', '', 'g'))
  );

update profiles pr
set favorite_park_id = m.keep_id
from tmp_park_merges m
where pr.favorite_park_id = m.drop_id;

delete from data_park_source_links d
using tmp_park_merges m
where d.park_id = m.drop_id
  and exists (
    select 1 from data_park_source_links keep
    where keep.park_id = m.keep_id
      and keep.source = d.source
      and keep.external_id is not distinct from d.external_id
  );

update data_park_source_links d
set park_id = m.keep_id
from tmp_park_merges m
where d.park_id = m.drop_id;

update data_coaster_name_aliases a
set park_id = m.keep_id
from tmp_park_merges m
where a.park_id = m.drop_id;

update data_review_findings f
set park_id = m.keep_id
from tmp_park_merges m
where f.park_id = m.drop_id;

delete from parks p
using tmp_park_merges m
where p.id = m.drop_id
  and not exists (select 1 from coasters c where c.park_id = p.id);

drop table if exists tmp_park_coaster_merges;
drop table if exists tmp_park_merges;
drop table if exists tmp_coaster_merges;

alter table coasters enable trigger trg_guard_unique_wikidata_binding;
