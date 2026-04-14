-- Retire legacy Queue-Times / Kaggle source metadata.
-- Keep only `wikidata` (or NULL) as an allowed external_source.

-- 1) Remove dead Queue-Times park field.
alter table parks
  drop column if exists queue_times_park_id;

-- 2) Resolve duplicate Wikidata bindings before source cleanup so trigger checks cannot fail.
with normalized as (
  select
    id,
    upper(
      coalesce(
        nullif(trim(wikidata_id), ''),
        case when external_source = 'wikidata' then nullif(trim(external_id), '') end
      )
    ) as qid
  from coasters
),
ranked as (
  select id, qid, row_number() over (partition by qid order by id) as rn
  from normalized
  where qid is not null
)
update coasters c
set wikidata_id = null,
    external_source = null,
    external_id = null
from ranked r
where c.id = r.id
  and r.rn > 1;

-- 3) Clear retired source markers.
update parks
set external_source = null,
    external_id = null
where external_source is not null
  and external_source <> 'wikidata';

update coasters
set external_source = null,
    external_id = null
where external_source is not null
  and external_source <> 'wikidata';

-- 4) Prevent reintroducing retired sources.
alter table parks
  drop constraint if exists parks_external_source_allowed;
alter table parks
  add constraint parks_external_source_allowed
  check (external_source is null or external_source = 'wikidata');

alter table coasters
  drop constraint if exists coasters_external_source_allowed;
alter table coasters
  add constraint coasters_external_source_allowed
  check (external_source is null or external_source = 'wikidata');
