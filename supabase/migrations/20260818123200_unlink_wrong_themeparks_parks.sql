-- Drop ThemeParks park links that attached the wrong venue (token overlap
-- on words like "adventure" / "Six Flags"), and stop treating those parks'
-- copied attraction lists as missing catalog coasters.

delete from data_park_source_links
where source = 'themeparks_wiki'
  and park_id in (282, 361, 88, 216);

insert into coasters (park_id, name, coaster_type, status)
select 126, 'Dragon Coaster', 'Steel', 'Operating'
where not exists (
  select 1 from coasters c
  where c.park_id = 126
    and lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '', 'g')) = 'dragoncoaster'
);

update data_review_findings
set status = 'resolved', resolved_at = now()
where status = 'open'
  and (
    (finding_type = 'source_attraction_unmatched' and park_id in (282, 361, 88, 91, 143, 126))
    or (
      park_id in (282, 361, 88, 216)
      and finding_type in ('local_coaster_missing_in_source', 'name_mismatch_candidate')
    )
  );

-- ThemeParks copies of other parks' ride names on an otherwise-correct park entity.
update data_review_findings
set status = 'ignored', resolved_at = now()
where status = 'open'
  and finding_type = 'source_attraction_unmatched'
  and park_id in (173, 178);
