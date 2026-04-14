create table if not exists parks (
  id bigint generated always as identity primary key,
  name text not null,
  country text not null,
  latitude double precision not null,
  longitude double precision not null,
  queue_times_park_id bigint,
  external_source text,
  external_id text,
  last_synced_at timestamptz
);

create table if not exists coasters (
  id bigint generated always as identity primary key,
  park_id bigint not null references parks(id) on delete cascade,
  name text not null,
  coaster_type text not null,
  manufacturer text,
  status text not null default 'Operating',
  external_source text,
  external_id text,
  last_synced_at timestamptz,
  -- Wikidata / Wikipedia enrichment (nullable; populated by wikidata:upload)
  wikidata_id   text,
  image_url     text,
  length_ft     integer,
  speed_mph     integer,
  height_ft     integer,
  inversions    integer,
  opening_year  integer,
  closing_year  integer,
  duration_s    integer,
  unique (park_id, name)
);

create table if not exists sync_runs (
  id bigint generated always as identity primary key,
  source text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_updated integer not null default 0,
  error text
);

create table if not exists rides (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  coaster_id bigint not null references coasters(id) on delete cascade,
  ridden_at timestamptz not null default now(),
  unique (user_id, coaster_id)
);

create table if not exists wishlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  coaster_id bigint not null references coasters(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, coaster_id)
);

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  country_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_display_name_allowed(raw_name text)
returns boolean
language plpgsql
immutable
as $$
declare
  trimmed text;
  lowered text;
  mapped text;
  token text;
  compact text := '';
  previous_char text := '';
  repeat_count integer := 0;
  banned_words text[] := array[
    'asshole',
    'bastard',
    'bitch',
    'cunt',
    'dick',
    'fuck',
    'motherfucker',
    'pussy',
    'rapist',
    'shit',
    'slut',
    'whore'
  ];
begin
  if raw_name is null then
    return false;
  end if;

  trimmed := btrim(raw_name);
  if trimmed <> raw_name then
    return false;
  end if;

  if char_length(trimmed) < 3 or char_length(trimmed) > 24 then
    return false;
  end if;

  if trimmed !~ '^[A-Za-z0-9](?:[A-Za-z0-9 ._-]*[A-Za-z0-9])?$' then
    return false;
  end if;

  lowered := lower(trimmed);
  mapped := translate(lowered, '013457@$!8', 'oieastasib');

  for token in
    select unnest(regexp_split_to_array(mapped, '[^a-z0-9]+'))
  loop
    if token = '' then
      continue;
    end if;

    if token = any (banned_words) then
      return false;
    end if;
  end loop;

  mapped := regexp_replace(mapped, '[^a-z0-9]+', '', 'g');
  for repeat_count in 1..char_length(mapped) loop
    token := substr(mapped, repeat_count, 1);
    if token = previous_char then
      continue;
    end if;
    compact := compact || token;
    previous_char := token;
  end loop;

  for token in select unnest(banned_words)
  loop
    if position(token in compact) > 0 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
before update on profiles
for each row
execute function public.touch_profiles_updated_at();

alter table profiles
  drop constraint if exists profiles_display_name_allowed;
alter table profiles
  add constraint profiles_display_name_allowed
  check (display_name is null or public.is_display_name_allowed(display_name));

alter table profiles
  drop constraint if exists profiles_country_code_format;
alter table profiles
  add constraint profiles_country_code_format
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

create index if not exists idx_coasters_park_id on coasters(park_id);

-- Stable upsert for Wikidata / Queue-Times rows (see migrations/004_coasters_stable_upsert.sql).
create unique index if not exists coasters_park_source_external_uidx
  on coasters (park_id, external_source, external_id)
  where external_id is not null and external_source is not null;
create index if not exists idx_rides_user_id on rides(user_id);
create index if not exists idx_rides_coaster_id on rides(coaster_id);
create index if not exists idx_wishlist_coaster_id on wishlist(coaster_id);
create index if not exists idx_profiles_display_name on profiles(display_name);

alter table parks enable row level security;
alter table coasters enable row level security;
alter table rides enable row level security;
alter table wishlist enable row level security;
alter table sync_runs enable row level security;
alter table profiles enable row level security;

drop policy if exists "public can read parks" on parks;
create policy "public can read parks" on parks for select using (true);

drop policy if exists "public can read coasters" on coasters;
create policy "public can read coasters" on coasters for select using (true);

drop policy if exists "users can read own rides" on rides;
create policy "users can read own rides" on rides for select using (auth.uid() = user_id);

drop policy if exists "users can create own rides" on rides;
create policy "users can create own rides" on rides for insert with check (auth.uid() = user_id);

drop policy if exists "users can delete own rides" on rides;
create policy "users can delete own rides" on rides for delete using (auth.uid() = user_id);

drop policy if exists "users can read own wishlist" on wishlist;
create policy "users can read own wishlist" on wishlist for select using (auth.uid() = user_id);

drop policy if exists "users can manage own wishlist" on wishlist;
create policy "users can manage own wishlist" on wishlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "no client access sync runs" on sync_runs;
create policy "no client access sync runs" on sync_runs for all using (false) with check (false);

drop policy if exists "users can read own profile" on profiles;
create policy "users can read own profile" on profiles for select using (auth.uid() = user_id);

drop policy if exists "users can insert own profile" on profiles;
create policy "users can insert own profile" on profiles for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own profile" on profiles;
create policy "users can update own profile" on profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can delete own profile" on profiles;
create policy "users can delete own profile" on profiles for delete using (auth.uid() = user_id);
