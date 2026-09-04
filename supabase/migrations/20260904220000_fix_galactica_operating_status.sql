-- Galactica (Q406696) still operates at Alton Towers.
-- Wikidata retained Air's 2015 VR-refurb end date as closing_year, which made
-- normalizeLifecycleStatus treat the ride as Defunct despite status Operating.

update public.coasters
set
  closing_year = null,
  status = 'Operating',
  last_synced_at = now()
where wikidata_id = 'Q406696'
  and (
    closing_year is not null
    or coalesce(status, '') <> 'Operating'
  );
