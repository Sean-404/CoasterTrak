-- The catalog-quality rows still open after 20261116150000_merge_ai_flagged_duplicates.sql.
-- The merge steps are the same as 20261104120000_merge_same_ride_duplicates.sql.

begin;

alter table coasters disable trigger trg_guard_unique_wikidata_binding;

-- Row 536 is Six Flags Magic Mountain's Goliath: both members who logged it logged the rest
-- of that park and have no Goliath credit. It was bound to the Wikidata item of Six Flags
-- Fiesta Texas's Goliath (Q2796656) and renamed Chupacabra with it. Its RCDB id is
-- unverified, so it is not carried over.
update coasters set rcdb_id = null where id = 536 and wikidata_id = 'Q2796656';

create temporary table tmp_ride_merges (
  ord serial primary key,
  drop_id bigint not null unique,
  keep_id bigint not null
) on commit drop;

insert into tmp_ride_merges (drop_id, keep_id) values
  -- Six Flags Magic Mountain: the mislabelled Goliath row, see above
  (536, 15883),
  -- Walibi Holland: "YoY" is the umbrella for two tracks, YOY Chill and YOY Thrill, which
  -- are the two credits. Its riders' logs move to YOY Thrill.
  (15659, 5202);

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

-- Q2796656 belongs to Chupacabra (ex-Goliath) at Six Flags Fiesta Texas.
update coasters
set wikidata_id = 'Q2796656', external_source = 'wikidata', external_id = 'Q2796656'
where id = 840
  and wikidata_id is null
  and not exists (select 1 from coasters where wikidata_id = 'Q2796656');

-- Both YoY tracks opened 5 Apr 2025.
update coasters set opening_year = 2025 where id in (5201, 5202) and opening_year is null;

-- The 2021 Intamin Big Dipper is at Luna Park Sydney and operating; it was filed under
-- Wonderland Sydney as Defunct.
update coasters
set park_id = (select id from parks where name = 'Luna Park Sydney'), status = 'Operating'
where id = 15622
  and wikidata_id = 'Q136436662'
  and exists (select 1 from parks where name = 'Luna Park Sydney');

-- Great Adventure's Jumbo Jet was erected in spring 1975 and dismantled a month later
-- without opening; 2015 is the Chelyuskintsev Park ride's opening.
update coasters
set status = 'Defunct', opening_year = 1975, closing_year = 1975
where id = 111 and name = 'Jumbo Jet';

-- Former installations listed under the name of their later home.
update coasters set name = 'Corkscrew' where id = 15784 and name = 'Corkscrew (Silverwood)';
update coasters set name = 'Wildcat' where id = 4379 and name = 'Wildcat (Jolly Roger Amusement Park)';

alter table coasters enable trigger trg_guard_unique_wikidata_binding;

commit;
