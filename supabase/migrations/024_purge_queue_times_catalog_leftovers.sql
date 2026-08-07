-- Purge remaining Queue-Times attraction dumps and merge Disney/Busch twin parks.
-- Queue-Times API sync is already retired (010); this cleans leftover catalog rows.
-- Always remap rides/wishlist/favorites before deleting coasters.

create or replace function tmp_qt_name_key(n text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          coalesce(n, ''),
          '\s+single\s+rider\s*$',
          '',
          'i'
        ),
        '^the\s+',
        '',
        'i'
      ),
      '[^a-z0-9]+',
      '',
      'g'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 1) Delete Single Rider queue-lane stubs (no user FKs in production).
-- ---------------------------------------------------------------------------
delete from coasters c
where c.name ~* 'single\s+rider'
  and not exists (select 1 from rides r where r.coaster_id = c.id)
  and not exists (select 1 from wishlist w where w.coaster_id = c.id)
  and not exists (select 1 from profiles pr where pr.favorite_ride_id = c.id);

-- ---------------------------------------------------------------------------
-- 2) Delete obvious non-coaster Queue-Times leftovers with no user data:
--    Unknown/Other, no stats, no Wikidata binding.
-- ---------------------------------------------------------------------------
delete from coasters c
where coalesce(c.coaster_type, 'Unknown') in ('Unknown', 'Other')
  and c.wikidata_id is null
  and c.height_ft is null
  and c.speed_mph is null
  and c.length_ft is null
  and c.inversions is null
  and c.duration_s is null
  and not exists (select 1 from rides r where r.coaster_id = c.id)
  and not exists (select 1 from wishlist w where w.coaster_id = c.id)
  and not exists (select 1 from profiles pr where pr.favorite_ride_id = c.id)
  and (
    -- Trademarked flats / dark rides / HHN houses from QT dumps
    position(chr(8482) in c.name) > 0
    or position(chr(174) in c.name) > 0
    or position(chr(169) in c.name) > 0
    -- Water-park inventory
    or exists (
      select 1 from parks p
      where p.id = c.park_id
        and (
          p.name ~* 'volcano\s+bay'
          or p.name ~* 'hurricane\s+harbor'
          or p.name ~* 'white\s+water'
          or p.name ~* 'aquatica'
          or p.name ~* 'rulantica'
          or p.name ~* 'caribbean\s+bay'
          or p.name ~* 'water\s*park'
        )
    )
    -- Explicit non-coaster name patterns
    or c.name ~* '(horror|haunting|haunted|maze|scarezone|halloween|hhn|express\s*-|theater|theatre|experience|discovery center|ollivanders|minion mayhem|alien attack|supercharged|fearfall|river adventure|ripsaw falls|bilge-rat|reign of kong|caro-seuss|accelatron|twirl.?n.?hurl|illumination|villain-con|dolls:|fallout|freddy|grave of|hatchet|jason|g[aa]lkn|artista)'
  );

-- ---------------------------------------------------------------------------
-- 3) Strip trademarks from surviving names.
-- ---------------------------------------------------------------------------
update coasters
set name = btrim(replace(replace(replace(name, chr(8482), ''), chr(174), ''), chr(169), ''))
where position(chr(8482) in name) > 0
   or position(chr(174) in name) > 0
   or position(chr(169) in name) > 0;

-- ---------------------------------------------------------------------------
-- 4) Merge Queue-Times twin parks into Wikidata-canonical parks.
-- ---------------------------------------------------------------------------
create table if not exists _mig024_park_pairs (
  dump_id bigint primary key,
  keep_id bigint not null
);

truncate _mig024_park_pairs;

insert into _mig024_park_pairs (dump_id, keep_id) values
  (340, 273), -- Disney Hollywood Studios -> Disney's Hollywood Studios
  (338, 191), -- Animal Kingdom -> Disney's Animal Kingdom
  (341, 151), -- Disney Magic Kingdom -> Magic Kingdom
  (275, 77),  -- Busch Gardens Tampa -> Busch Gardens Tampa Bay
  (342, 244), -- Disneyland Hong Kong -> Hong Kong Disneyland
  (339, 212); -- Disney Adventure World Paris -> Walt Disney Studios Park

-- Pair same-ride stubs -> enriched keeps (same keep park or dump->keep).
create table if not exists _mig024_coaster_pairs (
  stub_id bigint primary key,
  keep_id bigint not null
);

truncate _mig024_coaster_pairs;

insert into _mig024_coaster_pairs (stub_id, keep_id)
select distinct on (stub.id)
  stub.id,
  keep.id
from coasters stub
join _mig024_park_pairs pp on pp.dump_id = stub.park_id
join coasters keep on keep.park_id = pp.keep_id
where stub.id <> keep.id
  and (
    tmp_qt_name_key(stub.name) = tmp_qt_name_key(keep.name)
    or (
      tmp_qt_name_key(stub.name) like 'expeditioneverest%'
      and tmp_qt_name_key(keep.name) like 'expeditioneverest%'
    )
    or (
      tmp_qt_name_key(stub.name) like 'rocknrollercoaster%'
      and tmp_qt_name_key(keep.name) like 'rocknrollercoaster%'
    )
    or (
      tmp_qt_name_key(stub.name) like 'barnstormer%'
      and tmp_qt_name_key(keep.name) like 'barnstormer%'
    )
    or (
      tmp_qt_name_key(stub.name) like 'sevendwarfsminetrain%'
      and tmp_qt_name_key(keep.name) like 'sevendwarfsminetrain%'
    )
    or (
      tmp_qt_name_key(stub.name) like 'crushscoaster%'
      and tmp_qt_name_key(keep.name) like 'crushscoaster%'
    )
    or (
      tmp_qt_name_key(stub.name) like 'biggrizzlymountain%'
      and tmp_qt_name_key(keep.name) like 'biggrizzlymountain%'
    )
    or (
      tmp_qt_name_key(stub.name) = 'irongwazi'
      and tmp_qt_name_key(keep.name) = 'irongwazi'
    )
  )
order by
  stub.id,
  case when keep.wikidata_id is not null then 0 else 1 end,
  (
    (keep.height_ft is not null)::int
    + (keep.speed_mph is not null)::int
    + (keep.length_ft is not null)::int
  ) desc,
  keep.id;

-- Remap user FKs stub -> keep
delete from rides r
using _mig024_coaster_pairs p
where r.coaster_id = p.stub_id
  and exists (
    select 1 from rides r2
    where r2.user_id = r.user_id and r2.coaster_id = p.keep_id
  );

update rides r
set coaster_id = p.keep_id
from _mig024_coaster_pairs p
where r.coaster_id = p.stub_id;

delete from wishlist w
using _mig024_coaster_pairs p
where w.coaster_id = p.stub_id
  and exists (
    select 1 from wishlist w2
    where w2.user_id = w.user_id and w2.coaster_id = p.keep_id
  );

update wishlist w
set coaster_id = p.keep_id
from _mig024_coaster_pairs p
where w.coaster_id = p.stub_id;

update profiles pr
set favorite_ride_id = p.keep_id
from _mig024_coaster_pairs p
where pr.favorite_ride_id = p.stub_id;

delete from coasters c
using _mig024_coaster_pairs p
where c.id = p.stub_id;

-- Copy useful stats onto keep rows from any remaining dump twins before move
update coasters keep
set
  height_ft = coalesce(keep.height_ft, stub.height_ft),
  speed_mph = coalesce(keep.speed_mph, stub.speed_mph),
  length_ft = coalesce(keep.length_ft, stub.length_ft),
  inversions = coalesce(keep.inversions, stub.inversions),
  duration_s = coalesce(keep.duration_s, stub.duration_s),
  manufacturer = coalesce(keep.manufacturer, stub.manufacturer),
  coaster_type = case
    when coalesce(keep.coaster_type, 'Unknown') in ('Unknown', 'Other')
      and stub.coaster_type is not null
      and stub.coaster_type not in ('Unknown', 'Other')
    then stub.coaster_type
    else keep.coaster_type
  end,
  wikidata_id = coalesce(keep.wikidata_id, stub.wikidata_id),
  image_url = coalesce(keep.image_url, stub.image_url)
from coasters stub
join _mig024_park_pairs pp on pp.dump_id = stub.park_id
where keep.park_id = pp.keep_id
  and stub.id <> keep.id
  and tmp_qt_name_key(stub.name) = tmp_qt_name_key(keep.name);

-- Before absorbing dump parks, drop remaining non-coaster QT rows on those dumps
-- (Unknown/Other, no stats/Wikidata, no user data) so flats don't pollute keep parks.
delete from coasters c
using _mig024_park_pairs pp
where c.park_id = pp.dump_id
  and coalesce(c.coaster_type, 'Unknown') in ('Unknown', 'Other')
  and c.wikidata_id is null
  and c.height_ft is null
  and c.speed_mph is null
  and c.length_ft is null
  and c.inversions is null
  and c.duration_s is null
  and not exists (select 1 from rides r where r.coaster_id = c.id)
  and not exists (select 1 from wishlist w where w.coaster_id = c.id)
  and not exists (select 1 from profiles pr where pr.favorite_ride_id = c.id);

-- Move leftover dump coasters onto the canonical park
update coasters c
set park_id = pp.keep_id
from _mig024_park_pairs pp
where c.park_id = pp.dump_id;

-- Point favorite parks at keep ids
update profiles pr
set favorite_park_id = pp.keep_id
from _mig024_park_pairs pp
where pr.favorite_park_id = pp.dump_id;

-- Drop emptied dump parks
delete from parks p
using _mig024_park_pairs pp
where p.id = pp.dump_id
  and not exists (select 1 from coasters c where c.park_id = p.id);

drop table if exists _mig024_coaster_pairs;
drop table if exists _mig024_park_pairs;

-- Prefer current Paris park branding
update parks
set name = 'Disney Adventure World'
where id = 212
  and name = 'Walt Disney Studios Park';

-- ---------------------------------------------------------------------------
-- 5) Re-home reverse-geocode park shells onto real resorts.
-- ---------------------------------------------------------------------------
create or replace function tmp_move_park_coasters(from_park bigint, to_park bigint) returns int as $$
declare
  moved int := 0;
  r record;
  existing bigint;
  stub_wd text;
begin
  for r in select id, name, height_ft, speed_mph, length_ft, inversions, duration_s, wikidata_id, manufacturer, image_url
           from coasters where park_id = from_park loop
    select c.id into existing
    from coasters c
    where c.park_id = to_park
      and tmp_qt_name_key(c.name) = tmp_qt_name_key(r.name)
      and c.id <> r.id
    limit 1;

    if existing is not null then
      stub_wd := r.wikidata_id;
      update coasters set wikidata_id = null, external_id = null, external_source = null where id = r.id;

      update coasters keep set
        height_ft = coalesce(keep.height_ft, r.height_ft),
        speed_mph = coalesce(keep.speed_mph, r.speed_mph),
        length_ft = coalesce(keep.length_ft, r.length_ft),
        inversions = coalesce(keep.inversions, r.inversions),
        duration_s = coalesce(keep.duration_s, r.duration_s),
        manufacturer = coalesce(keep.manufacturer, r.manufacturer),
        image_url = coalesce(keep.image_url, r.image_url),
        wikidata_id = coalesce(keep.wikidata_id, stub_wd),
        external_source = case when keep.wikidata_id is null and stub_wd is not null then 'wikidata' else keep.external_source end,
        external_id = case when keep.external_id is null and stub_wd is not null then stub_wd else keep.external_id end
      where keep.id = existing;

      delete from rides rr where rr.coaster_id = r.id
        and exists (select 1 from rides r2 where r2.user_id = rr.user_id and r2.coaster_id = existing);
      update rides set coaster_id = existing where coaster_id = r.id;
      delete from wishlist ww where ww.coaster_id = r.id
        and exists (select 1 from wishlist w2 where w2.user_id = ww.user_id and w2.coaster_id = existing);
      update wishlist set coaster_id = existing where coaster_id = r.id;
      update profiles set favorite_ride_id = existing where favorite_ride_id = r.id;
      delete from coasters where id = r.id;
    else
      begin
        update coasters set park_id = to_park where id = r.id;
        moved := moved + 1;
      exception when unique_violation then
        null;
      end;
    end if;
  end loop;
  return moved;
end;
$$ language plpgsql;

select tmp_move_park_coasters(112, 1);   -- Alton, Staffordshire -> Alton Towers
select tmp_move_park_coasters(232, 77);  -- Tampa geocode -> Busch Gardens Tampa Bay
select tmp_move_park_coasters(60, 56);   -- Arlington, TX -> Six Flags Over Texas
select tmp_move_park_coasters(71, 70);   -- Jackson, NJ -> Six Flags Great Adventure
select tmp_move_park_coasters(127, 67);  -- Mason, OH -> Kings Island
select tmp_move_park_coasters(83, 117);  -- Muskegon -> Michigan's Adventure
select tmp_move_park_coasters(228, 49);  -- Elysburg -> Knoebels Amusement Resort
select tmp_move_park_coasters(224, 57);  -- Myrtle Beach Fantasy Way -> Family Kingdom

-- Euclid Beach historicals: rename the geocode shell into a real defunct park label
update parks
set name = 'Euclid Beach Park', country = 'United States'
where id = 7 and name = 'Cleveland, Ohio, United States';

-- Oklahoma City address shell -> leave rides but rename if still orphaned
update parks
set name = 'Wedgewood Village Amusement Park', country = 'United States'
where id = 52 and name like '63rd and N.W. Expressway%';

-- Drop emptied geocode parks
delete from parks p
where p.id in (60, 71, 127, 83, 228, 224, 112, 232)
  and not exists (select 1 from coasters c where c.park_id = p.id);

drop function if exists tmp_move_park_coasters(bigint, bigint);

-- ---------------------------------------------------------------------------
-- 6) Delete emptied water-park shells (rides already purged above when possible).
-- ---------------------------------------------------------------------------
delete from coasters c
where exists (
  select 1 from parks p
  where p.id = c.park_id
    and (
      p.name ~* 'volcano\s+bay'
      or p.name ~* 'hurricane\s+harbor'
      or p.name ~* 'white\s+water'
      or p.name ~* 'aquatica'
      or p.name ~* 'rulantica'
      or p.name ~* 'caribbean\s+bay'
    )
)
and coalesce(c.coaster_type, 'Unknown') in ('Unknown', 'Other')
and c.wikidata_id is null
and c.height_ft is null and c.speed_mph is null and c.length_ft is null
and not exists (select 1 from rides r where r.coaster_id = c.id)
and not exists (select 1 from wishlist w where w.coaster_id = c.id)
and not exists (select 1 from profiles pr where pr.favorite_ride_id = c.id);

delete from parks p
where (
  p.name ~* 'volcano\s+bay'
  or p.name ~* 'hurricane\s+harbor'
  or p.name ~* 'white\s+water'
  or p.name ~* 'aquatica'
  or p.name ~* 'rulantica'
  or p.name ~* 'caribbean\s+bay'
)
and not exists (select 1 from coasters c where c.park_id = p.id)
and not exists (select 1 from profiles pr where pr.favorite_park_id = p.id);

-- Mark remaining steel-ish rows at former water parks if any WD-backed survive
-- (none expected).

drop function if exists tmp_qt_name_key(text);
