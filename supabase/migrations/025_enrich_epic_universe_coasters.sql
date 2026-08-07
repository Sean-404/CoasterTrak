-- Enrich Epic Universe coasters with published stats; remove non-coaster leftovers.

update coasters set
  name = 'Hiccup''s Wing Gliders',
  coaster_type = 'Steel',
  status = 'Operating',
  manufacturer = 'Intamin',
  speed_mph = 45,
  inversions = 0,
  opening_year = 2025
where id = 9823;

update coasters set
  coaster_type = 'Steel',
  status = 'Operating',
  manufacturer = 'Mack Rides',
  speed_mph = 37,
  inversions = 0,
  duration_s = coalesce(duration_s, 130),
  opening_year = 2025
where id = 9753;

update coasters set
  coaster_type = 'Steel',
  status = 'Operating',
  manufacturer = coalesce(manufacturer, 'Setpoint'),
  inversions = coalesce(inversions, 0),
  duration_s = coalesce(duration_s, 180),
  opening_year = coalesce(opening_year, 2025)
where id = 9881;

update coasters set
  opening_year = coalesce(opening_year, 2025),
  manufacturer = coalesce(manufacturer, 'Mack Rides')
where id = 9727;

delete from coasters c
where c.id in (9715, 9801, 9811, 9835, 9781)
  and not exists (select 1 from rides r where r.coaster_id = c.id)
  and not exists (select 1 from wishlist w where w.coaster_id = c.id)
  and not exists (select 1 from profiles pr where pr.favorite_ride_id = c.id);
