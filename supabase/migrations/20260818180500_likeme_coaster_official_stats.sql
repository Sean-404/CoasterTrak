-- #LikeMe Coaster (Plopsaland Belgium) was inserted without stats.
-- Official attraction page: 36 km/h, 8 m, 360 m, 1:20.
-- https://www.plopsa.com/en/plopsaland-belgium/attractions/likeme-coaster

update coasters c
set
  manufacturer = coalesce(c.manufacturer, 'Zierer'),
  coaster_type = case when c.coaster_type in ('Unknown', 'Other') then 'Steel' else coalesce(c.coaster_type, 'Steel') end,
  height_ft = coalesce(c.height_ft, 26),
  speed_mph = coalesce(c.speed_mph, 22),
  length_ft = coalesce(c.length_ft, 1181),
  duration_s = coalesce(c.duration_s, 80),
  inversions = coalesce(c.inversions, 0),
  opening_year = case
    when c.opening_year is null or c.opening_year >= 2022 then 1976
    else c.opening_year
  end,
  last_synced_at = now()
from parks p
where c.park_id = p.id
  and p.name = 'Plopsaland Belgium'
  and lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g')) = 'likemecoaster';

insert into data_coaster_field_overrides (coaster_id, field_name, value_int, source, source_url)
select c.id, v.field_name, v.value_int, 'official_website',
  'https://www.plopsa.com/en/plopsaland-belgium/attractions/likeme-coaster'
from coasters c
join parks p on p.id = c.park_id
cross join (
  values
    ('height_ft', 26),
    ('speed_mph', 22),
    ('length_ft', 1181),
    ('duration_s', 80),
    ('inversions', 0)
) as v(field_name, value_int)
where p.name = 'Plopsaland Belgium'
  and lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g')) = 'likemecoaster'
on conflict (coaster_id, field_name) do update set
  value_int = excluded.value_int,
  source = excluded.source,
  source_url = excluded.source_url,
  approved = true;
