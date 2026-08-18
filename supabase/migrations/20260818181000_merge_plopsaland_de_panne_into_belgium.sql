-- Plopsaland De Panne is the former name of Plopsaland Belgium (same gate).
-- The Ride to Happiness was left on the old De Panne row (and that row was
-- reverse-geocoded as France because the park sits on the Belgian border).

update coasters c
set
  park_id = keep.id,
  last_synced_at = now()
from parks dump
join parks keep on keep.name = 'Plopsaland Belgium'
where dump.name = 'Plopsaland De Panne'
  and c.park_id = dump.id
  and not exists (
    select 1 from coasters x
    where x.park_id = keep.id
      and lower(regexp_replace(x.name, '[^a-zA-Z0-9]+', '', 'g'))
        = lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g'))
  );

update profiles pr
set favorite_park_id = keep.id
from parks dump
join parks keep on keep.name = 'Plopsaland Belgium'
where dump.name = 'Plopsaland De Panne'
  and pr.favorite_park_id = dump.id;

update data_park_source_links l
set park_id = keep.id
from parks dump
join parks keep on keep.name = 'Plopsaland Belgium'
where dump.name = 'Plopsaland De Panne'
  and l.park_id = dump.id
  and not exists (
    select 1 from data_park_source_links x
    where x.park_id = keep.id
      and x.source = l.source
      and x.external_id = l.external_id
  );

delete from data_park_source_links l
using parks dump
where dump.name = 'Plopsaland De Panne'
  and l.park_id = dump.id;

delete from parks dump
where dump.name = 'Plopsaland De Panne'
  and not exists (select 1 from coasters c where c.park_id = dump.id)
  and not exists (select 1 from profiles pr where pr.favorite_park_id = dump.id);
