-- Idempotent follow-up for Universal Orlando leftovers after 022
-- (name-key helper updates were unreliable across trademark glyphs).

update coasters
set
  park_id = 169,
  coaster_type = 'Steel',
  status = 'Operating',
  height_ft = coalesce(height_ft, 65),
  speed_mph = coalesce(speed_mph, 20),
  length_ft = coalesce(length_ft, 800),
  duration_s = coalesce(duration_s, 88),
  inversions = coalesce(inversions, 0),
  manufacturer = coalesce(manufacturer, 'Setpoint'),
  name = 'Pteranodon Flyers'
where id = 502
  and (park_id is distinct from 169 or height_ft is null);

-- Collapse leftover stubs onto enriched rows when both still exist.
do $$
declare
  stub int;
  keep int;
begin
  for stub, keep in
    select * from (values
      (9795, 502),   -- Pteranodon Flyers™ → Pteranodon Flyers
      (9785, 1416)   -- Jurassic World VelociCoaster → VelociCoaster
    ) as t(stub_id, keep_id)
    where exists (select 1 from coasters c where c.id = t.stub_id)
      and exists (select 1 from coasters c where c.id = t.keep_id)
  loop
    delete from rides r
    where r.coaster_id = stub
      and exists (select 1 from rides r2 where r2.user_id = r.user_id and r2.coaster_id = keep);
    update rides set coaster_id = keep where coaster_id = stub;

    delete from wishlist w
    where w.coaster_id = stub
      and exists (select 1 from wishlist w2 where w2.user_id = w.user_id and w2.coaster_id = keep);
    update wishlist set coaster_id = keep where coaster_id = stub;

    update profiles set favorite_ride_id = keep where favorite_ride_id = stub;
    delete from coasters where id = stub;
  end loop;
end $$;

update coasters
set
  coaster_type = 'Steel',
  status = 'Operating',
  name = 'Mine-Cart Madness',
  duration_s = coalesce(duration_s, 180)
where id = 9881
  and (coaster_type is distinct from 'Steel' or name like '%' || chr(8482) || '%');

delete from coasters where id in (9892, 9739);

update coasters
set coaster_type = 'Steel', status = 'Operating'
where id = 9797 and coaster_type is distinct from 'Steel';

update profiles set favorite_park_id = 169 where favorite_park_id = 172;

delete from parks p
where p.id = 172
  and not exists (select 1 from coasters c where c.park_id = p.id);

delete from parks p
where p.name in (
  'Islands Of Adventure At Universal Orlando',
  'Universal Studios At Universal Orlando'
)
and not exists (select 1 from coasters c where c.park_id = p.id);

update parks
set longitude = -abs(longitude)
where name = 'Epic Universe'
  and country ilike 'United States%'
  and longitude is not null
  and longitude > 0;
