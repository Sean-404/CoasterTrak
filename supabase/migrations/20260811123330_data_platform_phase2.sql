-- CoasterTrak Data Phase 2: DB-backed aliases, field overrides, auto park match support.

create table if not exists data_coaster_name_aliases (
  id bigint generated always as identity primary key,
  key_a text not null,
  key_b text not null,
  park_id bigint references parks(id) on delete cascade,
  source text not null default 'seed' check (source in ('seed', 'review', 'manual', 'themeparks_wiki')),
  approved boolean not null default true,
  created_at timestamptz not null default now(),
  constraint data_coaster_name_aliases_distinct check (key_a < key_b),
  unique (key_a, key_b, park_id)
);

create index if not exists data_coaster_name_aliases_key_a_idx
  on data_coaster_name_aliases (key_a) where approved = true;

create index if not exists data_coaster_name_aliases_key_b_idx
  on data_coaster_name_aliases (key_b) where approved = true;

create table if not exists data_coaster_field_overrides (
  id bigint generated always as identity primary key,
  coaster_id bigint not null references coasters(id) on delete cascade,
  field_name text not null check (field_name in ('height_ft', 'speed_mph', 'length_ft', 'duration_s', 'inversions', 'name', 'status')),
  value_int integer,
  value_text text,
  source text not null default 'manual' check (source in ('official_website', 'themeparks_wiki', 'wikidata', 'manual', 'review')),
  source_url text,
  approved boolean not null default true,
  created_at timestamptz not null default now(),
  unique (coaster_id, field_name)
);

create index if not exists data_coaster_field_overrides_coaster_idx
  on data_coaster_field_overrides (coaster_id) where approved = true;

alter table data_coaster_name_aliases enable row level security;
alter table data_coaster_field_overrides enable row level security;

alter table data_park_source_links
  drop constraint if exists data_park_source_links_match_method_check;

alter table data_park_source_links
  add constraint data_park_source_links_match_method_check
  check (match_method in ('seed', 'name', 'auto', 'manual'));

alter table data_review_findings
  drop constraint if exists data_review_findings_finding_type_check;

alter table data_review_findings
  add constraint data_review_findings_finding_type_check
  check (
    finding_type in (
      'local_coaster_missing_in_source',
      'source_attraction_unmatched',
      'park_unmapped',
      'name_mismatch_candidate',
      'park_match_candidate'
    )
  );

-- Wicker Man — 20 m (≈66 ft) per Alton Towers official site.
update coasters
set height_ft = 66
where wikidata_id = 'Q25223509'
   or (
     park_id = (select id from parks where name = 'Alton Towers' limit 1)
     and name = 'Wicker Man'
   );

insert into data_coaster_field_overrides (coaster_id, field_name, value_int, source, source_url)
select c.id, 'height_ft', 66, 'official_website', 'https://www.altontowers.com/explore/theme-park/rides-attractions/wicker-man/'
from coasters c
join parks p on p.id = c.park_id
where p.name = 'Alton Towers' and c.name = 'Wicker Man'
on conflict (coaster_id, field_name) do update set
  value_int = excluded.value_int,
  source = excluded.source,
  source_url = excluded.source_url,
  approved = true;

-- Seed alias pairs (normalized dedup keys; park_id null = global).
insert into data_coaster_name_aliases (key_a, key_b, park_id, source) values
  ('arthur', 'arthurtheride', null, 'seed'),
  ('barnstormer', 'barnstormeratgoofyswiseacrefarm', null, 'seed'),
  ('bigthundermountain', 'bigthundermountainrailroad', null, 'seed'),
  ('bluefire', 'bluefiremegacoaster', null, 'seed'),
  ('californiascreamin', 'incredicoaster', null, 'seed'),
  ('colossus', 'twistedcolossus', null, 'seed'),
  ('crazybats', 'templeofthenighthawk', null, 'seed'),
  ('eurosat', 'eurosatcancancoaster', null, 'seed'),
  ('expeditioneverest', 'expeditioneverestlegendoftheforbiddenmountain', null, 'seed'),
  ('goofysskyschool', 'mulhollandmadness', null, 'seed'),
  ('meanstreak', 'steelvengeance', null, 'seed'),
  ('mantis', 'rougarou', null, 'seed'),
  ('poseidon', 'waterrollercoasterposeidon', null, 'seed'),
  ('rocknrollercoaster', 'rocknrollercoasterstarringthemuppets', null, 'seed'),
  ('barnstormeratgoofyswiseacrefarm', 'thebarnstormer', null, 'seed'),
  ('topthrill2', 'topthrilldragster', null, 'seed'),
  ('voltronnevera', 'voltronneverapoweredbyrimac', null, 'seed'),
  ('winjasfear', 'winjasfearforce', null, 'seed'),
  ('winjasfearforce', 'winjasforce', null, 'seed'),
  ('blueflyer', 'zipperdipper', null, 'seed'),
  ('alpenexpressenzian', 'alpineexpressenzian', null, 'seed'),
  ('apocalypse', 'apocalypsetheride', null, 'seed')
on conflict (key_a, key_b, park_id) do nothing;
