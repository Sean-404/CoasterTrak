-- Merge near-duplicate park rows that differ only by Resort / Theme Park / Amusement Park noise.
-- Stats and ride joins use raw park_id, so display-only remaps leave splits like
-- "Thorpe Park" vs "Thorpe Park Resort" (Walking Dead).

with park_merge_pairs(keep_id, drop_id, keep_name) as (
  values
    (98::bigint, 155::bigint, 'Thorpe Park'::text),
    (210::bigint, 229::bigint, 'Flamingo Land'::text),
    (237::bigint, 141::bigint, 'Drayton Manor'::text),
    (195::bigint, 21::bigint, 'Lagoon'::text)
)
update parks p
set name = m.keep_name,
    last_synced_at = now()
from park_merge_pairs m
where p.id = m.keep_id
  and p.name is distinct from m.keep_name;

with park_merge_pairs(keep_id, drop_id) as (
  values
    (98::bigint, 155::bigint),
    (210::bigint, 229::bigint),
    (237::bigint, 141::bigint),
    (195::bigint, 21::bigint)
)
update coasters c
set park_id = m.keep_id,
    last_synced_at = now()
from park_merge_pairs m
where c.park_id = m.drop_id
  and not exists (
    select 1
    from coasters other
    where other.park_id = m.keep_id
      and lower(trim(other.name)) = lower(trim(c.name))
  );

with park_merge_pairs(keep_id, drop_id) as (
  values
    (98::bigint, 155::bigint),
    (210::bigint, 229::bigint),
    (237::bigint, 141::bigint),
    (195::bigint, 21::bigint)
)
update profiles pr
set favorite_park_id = m.keep_id
from park_merge_pairs m
where pr.favorite_park_id = m.drop_id;

with park_merge_pairs(keep_id, drop_id) as (
  values
    (98::bigint, 155::bigint),
    (210::bigint, 229::bigint),
    (237::bigint, 141::bigint),
    (195::bigint, 21::bigint)
)
delete from data_park_source_links d
using park_merge_pairs m
where d.park_id = m.drop_id
  and exists (
    select 1
    from data_park_source_links keep
    where keep.park_id = m.keep_id
      and keep.source = d.source
      and keep.external_id is not distinct from d.external_id
  );

with park_merge_pairs(keep_id, drop_id) as (
  values
    (98::bigint, 155::bigint),
    (210::bigint, 229::bigint),
    (237::bigint, 141::bigint),
    (195::bigint, 21::bigint)
)
update data_park_source_links d
set park_id = m.keep_id
from park_merge_pairs m
where d.park_id = m.drop_id;

with park_merge_pairs(keep_id, drop_id) as (
  values
    (98::bigint, 155::bigint),
    (210::bigint, 229::bigint),
    (237::bigint, 141::bigint),
    (195::bigint, 21::bigint)
)
update data_coaster_name_aliases a
set park_id = m.keep_id
from park_merge_pairs m
where a.park_id = m.drop_id;

with park_merge_pairs(keep_id, drop_id) as (
  values
    (98::bigint, 155::bigint),
    (210::bigint, 229::bigint),
    (237::bigint, 141::bigint),
    (195::bigint, 21::bigint)
)
update data_review_findings f
set park_id = m.keep_id
from park_merge_pairs m
where f.park_id = m.drop_id;

with park_merge_pairs(drop_id) as (
  values
    (155::bigint),
    (229::bigint),
    (141::bigint),
    (21::bigint)
)
delete from parks p
using park_merge_pairs m
where p.id = m.drop_id
  and not exists (select 1 from coasters c where c.park_id = p.id);
