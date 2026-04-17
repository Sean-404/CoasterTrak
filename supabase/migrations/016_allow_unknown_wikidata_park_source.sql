-- Allow fallback park rows created from Wikidata coaster entries without a resolvable park.
alter table parks
  drop constraint if exists parks_external_source_allowed;

alter table parks
  add constraint parks_external_source_allowed
  check (
    external_source is null
    or external_source in ('wikidata', 'wikidata_unknown_park')
  );
