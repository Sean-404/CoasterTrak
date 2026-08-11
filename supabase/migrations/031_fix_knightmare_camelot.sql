-- Knightmare (Q13415786) belongs at defunct Camelot Theme Park (Chorley),
-- not Blackpool Pleasure Beach. A wide unlabeled coord snap moved it wrongly.

insert into parks (name, country, latitude, longitude, external_source, external_id, last_synced_at)
select
  'Camelot Theme Park',
  'United Kingdom',
  53.63528,
  -2.69750,
  'wikidata_unknown_park',
  'manual:camelot-theme-park',
  now()
where not exists (
  select 1 from parks
  where name = 'Camelot Theme Park'
     or external_id = 'manual:camelot-theme-park'
);

update coasters c
set
  park_id = p.id,
  status = 'Defunct',
  closing_year = coalesce(c.closing_year, 2012),
  last_synced_at = now()
from parks p
where c.wikidata_id = 'Q13415786'
  and (
    p.external_id = 'manual:camelot-theme-park'
    or p.name = 'Camelot Theme Park'
  );
