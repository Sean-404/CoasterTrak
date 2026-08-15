-- Six Flags America closed 2 Nov 2025; Ride of Steel closed with the park.
-- https://en.wikipedia.org/wiki/Six_Flags_America
-- https://en.wikipedia.org/wiki/Ride_of_Steel
update coasters c
set
  status = 'Defunct',
  opening_year = coalesce(c.opening_year, 2000),
  closing_year = coalesce(c.closing_year, 2025),
  last_synced_at = now()
from parks p
where c.park_id = p.id
  and c.wikidata_id = 'Q839200'
  and p.name = 'Six Flags America';

-- Vertigorama never opened (SBNO). Park row was a location dump, not the park name.
-- https://en.wikipedia.org/wiki/Parque_de_la_Ciudad
-- https://coasterpedia.net/wiki/Vertigorama
update parks
set
  name = 'Parque de la Ciudad',
  latitude = -34.67175,
  longitude = -58.45108,
  external_source = coalesce(external_source, 'wikidata'),
  external_id = coalesce(external_id, 'Q7139688'),
  last_synced_at = now()
where name = 'Argentina, Villa Soldati, Buenos Aires'
  and country = 'Argentina';

update coasters
set
  status = 'Defunct',
  coaster_type = 'Steel',
  manufacturer = coalesce(manufacturer, 'Intamin'),
  inversions = coalesce(inversions, 0),
  last_synced_at = now()
where wikidata_id = 'Q2518728';

insert into data_coaster_field_overrides (coaster_id, field_name, value_text, source, source_url)
select c.id, 'status', 'Defunct', 'manual', 'https://en.wikipedia.org/wiki/Six_Flags_America'
from coasters c
join parks p on p.id = c.park_id
where c.wikidata_id = 'Q839200'
  and p.name = 'Six Flags America'
on conflict (coaster_id, field_name) do update set
  value_text = excluded.value_text,
  source = excluded.source,
  source_url = excluded.source_url,
  approved = true;

insert into data_coaster_field_overrides (coaster_id, field_name, value_text, source, source_url)
select c.id, 'status', 'Defunct', 'manual', 'https://en.wikipedia.org/wiki/Parque_de_la_Ciudad'
from coasters c
where c.wikidata_id = 'Q2518728'
on conflict (coaster_id, field_name) do update set
  value_text = excluded.value_text,
  source = excluded.source,
  source_url = excluded.source_url,
  approved = true;
