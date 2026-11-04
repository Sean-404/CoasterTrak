-- Merge rows that are one physical ride listed under two names (renames, translations,
-- retheme names). Each pair was checked against the ride's Wikipedia article or park
-- sources. Rebuilds counted as new credits (New Texas Giant, Iron Rattler, ...) are NOT
-- merged: their old rows are closed via FORMER_INSTALL_FIXES in src/lib/catalog-closures.ts.
--
-- Ride logs move to the surviving row. A rider who logged both rows keeps one credit:
-- same-day counts are added (capped at 99), the first ride date and any rating are kept.
-- Pairs run one at a time so several old names can merge into one ride.

begin;

alter table coasters disable trigger trg_guard_unique_wikidata_binding;

create temporary table tmp_ride_merges (
  ord serial primary key,
  drop_id bigint not null unique,
  keep_id bigint not null
) on commit drop;

insert into tmp_ride_merges (drop_id, keep_id) values
  -- Europa-Park: Eurosat became Eurosat - CanCan Coaster in 2018
  (15675, 4385),
  -- Carowinds: Scooby-Doo's Ghoster Coaster, Fairly Odd Coaster, now Woodstock Express
  (128, 952),
  (703, 952),
  -- Chessington: Runaway Train renamed Scorpion Express
  (256, 257),
  -- Disneyland Paris: all three names of Space Mountain; Big Thunder Mountain twin
  (389, 1277),
  (726, 1277),
  (15775, 10470),
  -- Dreamworld: Rugrats Runaway Reptar, Escape from Madagascar, now Kenny's Forest Flyer
  (617, 605),
  -- Efteling: Bobbaan is the Dutch name of Swiss Bob; George and the Dragon is the English
  -- name of Joris en de Draak
  (14683, 236),
  (14557, 6054),
  -- Hersheypark: Sidewinder renamed Jolly Rancher Remix
  (311, 6247),
  -- Kennywood: Pippin became Thunderbolt; Steel Phantom became Phantom's Revenge
  (37, 98),
  (312, 589),
  -- Kentucky Kingdom: T2 and the Garuda Glide row (shown as T3) are one ride
  (391, 1194),
  -- Kings Dominion: Scooby-Doo is now Woodstock Express; Intimidator 305 is now Pantherian
  (122, 1116),
  (934, 4674),
  -- Kings Island: The Beastie, Scooby-Doo and Fairly Odd Coaster are now Woodstock Express;
  -- Top Gun is now The Bat; Flying Ace Aerial Chase is now Woodstock's Air Rail
  (182, 40),
  (740, 40),
  (114, 40),
  (353, 184),
  (578, 4759),
  -- Legendia: Diabelska petla is the Polish name of Devil's Loop
  (14684, 15359),
  -- Movie Park Germany: MP Xpress renamed Iron Claw in 2023
  (586, 8859),
  -- SeaWorld Orlando: Kraken Unleashed was Kraken's VR name
  (14672, 541),
  -- Tokyo Disneyland: Big Thunder Mountain twin
  (15774, 15701),
  -- Walibi Belgium: Psyke Underground went back to Turbine in 2025
  (15587, 5167),
  -- Legoland Billund: Technic Coaster is Lego Technic Test Track
  (14627, 15823),
  -- Parque Warner Madrid: Gotham City Escape twin
  (15897, 14563);

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

    -- Release the stub's ids first: (park_id, external_source, external_id) is unique.
    update coasters
    set wikidata_id = null, external_source = null, external_id = null
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

-- Eurosat has run since 1989; the 2018 date is its reopening as CanCan Coaster.
update coasters set opening_year = 1989 where id = 4385;

-- Dreamworld's ride reopened under its current name in August 2023.
update coasters set name = 'Kenny''s Forest Flyer' where id = 605;

alter table coasters enable trigger trg_guard_unique_wikidata_binding;

commit;
