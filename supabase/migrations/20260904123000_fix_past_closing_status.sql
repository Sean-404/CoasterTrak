-- Mark catalog rows with a past closing_year as Defunct when still labeled Operating.
-- Also fix Thunderlooper at Alton Towers (closed 1996; later relocated to Hopi Hari as Katapul).

update coasters
set
  status = 'Defunct',
  last_synced_at = now()
where status is distinct from 'Defunct'
  and closing_year is not null
  and closing_year <= extract(year from now())::int
  and (opening_year is null or opening_year <= closing_year);

update coasters c
set
  status = 'Defunct',
  closing_year = coalesce(c.closing_year, 1996),
  last_synced_at = now()
from parks p
where c.park_id = p.id
  and p.name ilike '%Alton Towers%'
  and regexp_replace(lower(c.name), '[^a-z0-9]+', '', 'g') = 'thunderlooper'
  and (
    c.status is distinct from 'Defunct'
    or c.closing_year is null
  );
