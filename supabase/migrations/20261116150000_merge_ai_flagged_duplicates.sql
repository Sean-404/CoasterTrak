-- Duplicate rows flagged by the catalog-quality AI review (16 Nov 2026), each checked
-- against the ride's Wikipedia article. None of the dropped rows has ride logs; the merge
-- steps are the same as 20261104120000_merge_same_ride_duplicates.sql.

begin;

alter table coasters disable trigger trg_guard_unique_wikidata_binding;

-- Row 52 carries Kuwait Entertainment City's Lightning (Q3238476, now Tanjora) but sits at
-- Revere Beach, which has its own Lightning row (Q2290037). File it under Kuwait so it can
-- merge into that park's Lightning row.
update coasters
set park_id = (select park_id from coasters where id = 663)
where id = 52
  and wikidata_id = 'Q3238476'
  and exists (select 1 from coasters where id = 663);

create temporary table tmp_ride_merges (
  ord serial primary key,
  drop_id bigint not null unique,
  keep_id bigint not null
) on commit drop;

insert into tmp_ride_merges (drop_id, keep_id) values
  -- Six Flags Fiesta Texas: the /extend row for Chupacabra (ex-Goliath) duplicates the park's row
  (15780, 840),
  -- Wonderland Park (Texas): the /extend row for Hornet duplicates the Wikidata row, which
  -- still carries the ride's AstroWorld name (Mayan Mindbender)
  (15810, 889),
  -- Kuwait Entertainment City: Lightning, see above
  (52, 663);

do $$
declare
  m record;
  stub coasters%rowtype;
  key_stub text;
  key_keep text;
begin
  for m in select drop_id, keep_id from tmp_ride_merges order by ord loop
    select * into stub from coasters where id = m.drop_id;
    if not found then
      raise notice 'Skipping %: row already gone', m.drop_id;
      continue;
    end if;
    if not exists (select 1 from coasters where id = m.keep_id and park_id = stub.park_id) then
      raise exception 'Merge % -> %: keep row missing or at a different park', m.drop_id, m.keep_id;
    end if;

    -- Release the stub's ids first: rcdb_id and (park_id, external_source, external_id)
    -- are unique, so both rows cannot hold them while they are copied across.
    update coasters
    set wikidata_id = null, external_source = null, external_id = null, rcdb_id = null
    where id = m.drop_id;

    update coasters k
    set
      wikidata_id = coalesce(k.wikidata_id, stub.wikidata_id),
      external_source = coalesce(k.external_source, stub.external_source),
      external_id = coalesce(k.external_id, stub.external_id),
      manufacturer = coalesce(k.manufacturer, stub.manufacturer),
      image_url = coalesce(k.image_url, stub.image_url),
      enwiki_title = coalesce(k.enwiki_title, stub.enwiki_title),
      summary_text = coalesce(k.summary_text, stub.summary_text),
      opening_year = coalesce(k.opening_year, stub.opening_year),
      closing_year = coalesce(k.closing_year, stub.closing_year),
      height_ft = coalesce(k.height_ft, stub.height_ft),
      speed_mph = coalesce(k.speed_mph, stub.speed_mph),
      length_ft = coalesce(k.length_ft, stub.length_ft),
      inversions = coalesce(k.inversions, stub.inversions),
      duration_s = coalesce(k.duration_s, stub.duration_s),
      rcdb_id = coalesce(k.rcdb_id, stub.rcdb_id)
    where k.id = m.keep_id;

    -- Ride events: add quantities on days both rows were logged, then remap the rest.
    update ride_events keep
    set quantity = least(99, keep.quantity + s.quantity)
    from ride_events s
    where s.coaster_id = m.drop_id
      and keep.coaster_id = m.keep_id
      and keep.user_id = s.user_id
      and keep.ridden_on is not distinct from s.ridden_on;

    delete from ride_events s
    where s.coaster_id = m.drop_id
      and exists (
        select 1 from ride_events keep
        where keep.coaster_id = m.keep_id
          and keep.user_id = s.user_id
          and keep.ridden_on is not distinct from s.ridden_on
      );

    update ride_events set coaster_id = m.keep_id where coaster_id = m.drop_id;

    -- Credits: one per rider. Keep the earliest date and any rating.
    update rides keep
    set
      ridden_at = least(keep.ridden_at, s.ridden_at),
      rating = coalesce(keep.rating, s.rating)
    from rides s
    where s.coaster_id = m.drop_id
      and keep.coaster_id = m.keep_id
      and keep.user_id = s.user_id;

    delete from rides s
    where s.coaster_id = m.drop_id
      and exists (
        select 1 from rides keep
        where keep.coaster_id = m.keep_id and keep.user_id = s.user_id
      );

    update rides set coaster_id = m.keep_id where coaster_id = m.drop_id;

    delete from wishlist w
    where w.coaster_id = m.drop_id
      and exists (
        select 1 from wishlist keep
        where keep.coaster_id = m.keep_id and keep.user_id = w.user_id
      );

    update wishlist set coaster_id = m.keep_id where coaster_id = m.drop_id;

    update profiles set favorite_ride_id = m.keep_id where favorite_ride_id = m.drop_id;

    delete from data_coaster_source_links d
    where d.coaster_id = m.drop_id
      and exists (
        select 1 from data_coaster_source_links keep
        where keep.coaster_id = m.keep_id and keep.source = d.source
      );

    update data_coaster_source_links set coaster_id = m.keep_id where coaster_id = m.drop_id;

    delete from data_coaster_field_overrides o
    where o.coaster_id = m.drop_id
      and exists (
        select 1 from data_coaster_field_overrides keep
        where keep.coaster_id = m.keep_id and keep.field_name = o.field_name
      );

    update data_coaster_field_overrides set coaster_id = m.keep_id where coaster_id = m.drop_id;

    update data_review_findings set coaster_id = m.keep_id where coaster_id = m.drop_id;

    -- Remember the old name so feeds using it match the surviving row, not a new one.
    key_stub := regexp_replace(lower(stub.name), '[^a-z0-9]', '', 'g');
    select regexp_replace(lower(name), '[^a-z0-9]', '', 'g') into key_keep from coasters where id = m.keep_id;
    if key_stub <> '' and key_keep <> '' and key_stub <> key_keep
      and not exists (
        select 1 from data_coaster_name_aliases a
        where a.key_a = least(key_stub, key_keep)
          and a.key_b = greatest(key_stub, key_keep)
          and a.park_id is not distinct from stub.park_id
      )
    then
      insert into data_coaster_name_aliases (key_a, key_b, park_id, source)
      values (least(key_stub, key_keep), greatest(key_stub, key_keep), stub.park_id, 'manual');
    end if;

    delete from coasters where id = m.drop_id;
  end loop;
end $$;

alter table coasters enable trigger trg_guard_unique_wikidata_binding;

commit;
