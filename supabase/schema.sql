create table if not exists parks (
  id bigint generated always as identity primary key,
  name text not null,
  country text not null,
  latitude double precision not null,
  longitude double precision not null,
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
  favorite_ride text,
  favorite_ride_id bigint references coasters(id) on delete set null,
  favorite_park text,
  favorite_park_id bigint references parks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
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

create or replace function public.touch_friendships_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status <> old.status and new.status in ('accepted', 'declined', 'blocked') then
    new.responded_at := coalesce(new.responded_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_friendships_updated_at on friendships;
create trigger trg_friendships_updated_at
before update on friendships
for each row
execute function public.touch_friendships_updated_at();

alter table profiles
  add column if not exists favorite_ride text;
alter table profiles
  add column if not exists favorite_ride_id bigint references coasters(id) on delete set null;
alter table profiles
  add column if not exists favorite_park text;
alter table profiles
  add column if not exists favorite_park_id bigint references parks(id) on delete set null;
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
alter table profiles
  drop constraint if exists profiles_favorite_ride_length;
alter table profiles
  add constraint profiles_favorite_ride_length
  check (favorite_ride is null or char_length(btrim(favorite_ride)) between 1 and 80);
alter table profiles
  drop constraint if exists profiles_favorite_park_length;
alter table profiles
  add constraint profiles_favorite_park_length
  check (favorite_park is null or char_length(btrim(favorite_park)) between 1 and 80);

alter table friendships
  drop constraint if exists friendships_not_self;
alter table friendships
  add constraint friendships_not_self check (requester_id <> addressee_id);

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

create index if not exists idx_coasters_park_id on coasters(park_id);

-- Stable upsert for Wikidata / Queue-Times rows (see migrations/004_coasters_stable_upsert.sql).
create unique index if not exists coasters_park_source_external_uidx
  on coasters (park_id, external_source, external_id)
  where external_id is not null and external_source is not null;
create index if not exists idx_rides_user_id on rides(user_id);
create index if not exists idx_rides_coaster_id on rides(coaster_id);
create index if not exists idx_wishlist_coaster_id on wishlist(coaster_id);
create index if not exists idx_profiles_display_name on profiles(display_name);
create index if not exists idx_profiles_favorite_ride_id on profiles(favorite_ride_id);
create index if not exists idx_profiles_favorite_park_id on profiles(favorite_park_id);
create unique index if not exists profiles_display_name_lower_uidx
  on profiles (lower(display_name))
  where display_name is not null;
create unique index if not exists friendships_pair_uidx
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists idx_friendships_requester on friendships(requester_id);
create index if not exists idx_friendships_addressee on friendships(addressee_id);
create index if not exists idx_friendships_status on friendships(status);

create or replace function public.guard_unique_wikidata_binding()
returns trigger
language plpgsql
as $$
declare
  new_qid text;
  conflict_id bigint;
begin
  if TG_OP = 'UPDATE' then
    if not (
      new.wikidata_id is distinct from old.wikidata_id
      or new.external_source is distinct from old.external_source
      or new.external_id is distinct from old.external_id
    ) then
      return new;
    end if;
  end if;

  new_qid := coalesce(nullif(trim(new.wikidata_id), ''), null);
  if new_qid is null and new.external_source = 'wikidata' then
    new_qid := nullif(trim(new.external_id), '');
  end if;

  if new_qid is null then
    return new;
  end if;

  new_qid := upper(new_qid);

  select c.id
    into conflict_id
    from coasters c
   where c.id <> new.id
     and (
       upper(coalesce(nullif(trim(c.wikidata_id), ''), '')) = new_qid
       or (
         c.external_source = 'wikidata'
         and upper(coalesce(nullif(trim(c.external_id), ''), '')) = new_qid
       )
     )
   order by c.id
   limit 1;

  if conflict_id is not null then
    raise exception
      'Wikidata Q-id % is already bound to coaster id=%',
      new_qid, conflict_id
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_unique_wikidata_binding on coasters;
create trigger trg_guard_unique_wikidata_binding
before insert or update on coasters
for each row
execute function public.guard_unique_wikidata_binding();

alter table parks enable row level security;
alter table coasters enable row level security;
alter table rides enable row level security;
alter table wishlist enable row level security;
alter table sync_runs enable row level security;
alter table profiles enable row level security;
alter table friendships enable row level security;

drop policy if exists "public can read parks" on parks;
create policy "public can read parks" on parks for select using (true);

drop policy if exists "public can read coasters" on coasters;
create policy "public can read coasters" on coasters for select using (true);

drop policy if exists "users can read own rides" on rides;
drop policy if exists "users can read own rides and accepted friends rides" on rides;
create policy "users can read own rides and accepted friends rides"
  on rides for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = rides.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = rides.user_id)
        )
    )
  );

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

drop policy if exists "authenticated can read public profiles" on profiles;
create policy "authenticated can read public profiles" on profiles for select to authenticated using (display_name is not null);

drop policy if exists "users can insert own profile" on profiles;
create policy "users can insert own profile" on profiles for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own profile" on profiles;
create policy "users can update own profile" on profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can delete own profile" on profiles;
create policy "users can delete own profile" on profiles for delete using (auth.uid() = user_id);

drop policy if exists "users can read their friendships" on friendships;
create policy "users can read their friendships" on friendships for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "users can create friendship requests" on friendships;
create policy "users can create friendship requests" on friendships for insert with check (auth.uid() = requester_id and requester_id <> addressee_id);

drop policy if exists "users can update their friendships" on friendships;
create policy "users can update their friendships" on friendships for update using (auth.uid() = requester_id or auth.uid() = addressee_id) with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "users can delete their friendships" on friendships;
create policy "users can delete their friendships" on friendships for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);
