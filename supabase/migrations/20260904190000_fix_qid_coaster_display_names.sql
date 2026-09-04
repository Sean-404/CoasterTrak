-- Fix bare Wikidata Q-id display names.
-- Prefer merging into an existing same-park ride when the real name already exists;
-- otherwise rename. Delete any leftover orphan Q-id stubs with no user data.

alter table coasters disable trigger trg_guard_unique_wikidata_binding;

-- ---------------------------------------------------------------------------
-- 1) Merge Q-id stub into existing Cétautomatix at Parc Astérix
-- ---------------------------------------------------------------------------
drop table if exists tmp_qid_coaster_merges;
create table tmp_qid_coaster_merges (
  stub_id bigint primary key,
  keep_id bigint not null
);

insert into tmp_qid_coaster_merges (stub_id, keep_id) values
  (14577, 5130); -- Q135790425 → Cétautomatix

-- Free unique keys on the stub before copying onto keep.
update coasters s
set
  wikidata_id = null,
  external_source = null,
  external_id = null
from tmp_qid_coaster_merges m
where s.id = m.stub_id;

update coasters k
set
  wikidata_id = coalesce(k.wikidata_id, 'Q135790425'),
  external_source = coalesce(k.external_source, 'wikidata'),
  external_id = coalesce(k.external_id, 'Q135790425'),
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
from tmp_qid_coaster_merges m
join coasters s on s.id = m.stub_id
where k.id = m.keep_id;

update ride_events keep
set quantity = least(99, keep.quantity + stub.quantity)
from ride_events stub
join tmp_qid_coaster_merges m on stub.coaster_id = m.stub_id
where keep.user_id = stub.user_id
  and keep.coaster_id = m.keep_id
  and keep.ridden_on is not distinct from stub.ridden_on
  and keep.id <> stub.id;

delete from ride_events stub
using tmp_qid_coaster_merges m
where stub.coaster_id = m.stub_id
  and exists (
    select 1 from ride_events keep
    where keep.user_id = stub.user_id
      and keep.coaster_id = m.keep_id
      and keep.ridden_on is not distinct from stub.ridden_on
  );

update ride_events stub
set coaster_id = m.keep_id
from tmp_qid_coaster_merges m
where stub.coaster_id = m.stub_id;

delete from rides r
using tmp_qid_coaster_merges m
where r.coaster_id = m.stub_id
  and exists (
    select 1 from rides r2
    where r2.user_id = r.user_id and r2.coaster_id = m.keep_id
  );

update rides r
set coaster_id = m.keep_id
from tmp_qid_coaster_merges m
where r.coaster_id = m.stub_id;

delete from wishlist w
using tmp_qid_coaster_merges m
where w.coaster_id = m.stub_id
  and exists (
    select 1 from wishlist w2
    where w2.user_id = w.user_id and w2.coaster_id = m.keep_id
  );

update wishlist w
set coaster_id = m.keep_id
from tmp_qid_coaster_merges m
where w.coaster_id = m.stub_id;

update profiles p
set favorite_ride_id = m.keep_id
from tmp_qid_coaster_merges m
where p.favorite_ride_id = m.stub_id;

delete from data_coaster_source_links d
using tmp_qid_coaster_merges m
where d.coaster_id = m.stub_id
  and exists (
    select 1 from data_coaster_source_links d2
    where d2.coaster_id = m.keep_id and d2.source = d.source
  );

update data_coaster_source_links d
set coaster_id = m.keep_id
from tmp_qid_coaster_merges m
where d.coaster_id = m.stub_id;

update data_review_findings f
set coaster_id = m.keep_id
from tmp_qid_coaster_merges m
where f.coaster_id = m.stub_id;

delete from coasters c
using tmp_qid_coaster_merges m
where c.id = m.stub_id;

-- ---------------------------------------------------------------------------
-- 2) Rename remaining Q-id rows that have recoverable Wikidata labels
-- ---------------------------------------------------------------------------
update public.coasters set name = 'ジェットコースター', last_synced_at = now()
where wikidata_id = 'Q132174212' and name ~* '^Q[0-9]+$';

update public.coasters set name = 'Alpenblitz', last_synced_at = now()
where wikidata_id = 'Q19765421' and name ~* '^Q[0-9]+$';

update public.coasters set name = 'Tornado', last_synced_at = now()
where wikidata_id = 'Q21008851' and name ~* '^Q[0-9]+$';

update public.coasters set name = 'Dragon Wagon', last_synced_at = now()
where wikidata_id = 'Q2505886' and name ~* '^Q[0-9]+$';

update public.coasters set name = 'Coccinelle', last_synced_at = now()
where wikidata_id = 'Q56697767' and name ~* '^Q[0-9]+$';

-- ---------------------------------------------------------------------------
-- 3) Drop any leftover orphan Q-id stubs (no user data)
-- ---------------------------------------------------------------------------
delete from public.coasters c
where c.name ~* '^Q[0-9]+$'
  and not exists (select 1 from public.rides r where r.coaster_id = c.id)
  and not exists (select 1 from public.ride_events e where e.coaster_id = c.id)
  and not exists (select 1 from public.wishlist w where w.coaster_id = c.id)
  and not exists (select 1 from public.profiles p where p.favorite_ride_id = c.id);

drop table if exists tmp_qid_coaster_merges;

alter table coasters enable trigger trg_guard_unique_wikidata_binding;
