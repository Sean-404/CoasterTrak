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
  -- Wikidata / Wikipedia enrichment (nullable; populated by CoasterTrak Data publish)
  wikidata_id   text,
  image_url     text,
  length_ft     integer,
  speed_mph     integer,
  height_ft     integer,
  inversions    integer,
  opening_year  integer,
  closing_year  integer,
  duration_s    integer,
  enwiki_title  text,
  summary_text  text,
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
  rating smallint check (rating is null or (rating >= 1 and rating <= 5)),
  photo_path text,
  unique (user_id, coaster_id),
  constraint rides_photo_path_matches_owner check (
    photo_path is null
    or photo_path = (user_id::text || '/' || coaster_id::text || '.jpg')
  )
);

-- Event-level ride logs. `rides` remains one unique credit (+ rating) per coaster.
create table if not exists ride_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  coaster_id bigint not null references coasters(id) on delete cascade,
  ridden_on date,
  quantity integer not null default 1,
  source text not null default 'user_log',
  created_at timestamptz not null default now(),
  constraint ride_events_quantity_range check (quantity >= 1 and quantity <= 99),
  constraint ride_events_source_allowed check (source in ('legacy_credit', 'user_log'))
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
  avatar_key text,
  avatar_path text,
  banned_at timestamptz,
  ban_reason text,
  favorite_ride_id bigint references coasters(id) on delete set null,
  favorite_park_id bigint references parks(id) on delete set null,
  stats_visibility text not null default 'friends' check (stats_visibility in ('friends', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_avatar_path_matches_owner check (
    avatar_path is null
    or avatar_path = (user_id::text || '/avatar.jpg')
  )
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
  add column if not exists favorite_ride_id bigint references coasters(id) on delete set null;
alter table profiles
  add column if not exists favorite_park_id bigint references parks(id) on delete set null;
alter table profiles
  drop constraint if exists profiles_favorite_ride_length;
alter table profiles
  drop constraint if exists profiles_favorite_park_length;
alter table profiles
  drop column if exists favorite_ride;
alter table profiles
  drop column if exists favorite_park;
alter table profiles
  drop constraint if exists profiles_display_name_allowed;
alter table profiles
  add constraint profiles_display_name_allowed
  check (display_name is null or public.is_display_name_allowed(display_name));

alter table profiles
  add column if not exists avatar_key text;
alter table profiles
  drop constraint if exists profiles_avatar_key_allowed;
alter table profiles
  add constraint profiles_avatar_key_allowed
  check (
    avatar_key is null
    or avatar_key in (
      'rose',
      'sky',
      'violet',
      'amber',
      'orange',
      'emerald',
      'slate',
      'cyan'
    )
  );

alter table profiles
  drop constraint if exists profiles_country_code_format;
alter table profiles
  add constraint profiles_country_code_format
  check (country_code is null or country_code ~ '^[A-Z]{2}$');
alter table friendships
  drop constraint if exists friendships_not_self;
alter table friendships
  add constraint friendships_not_self check (requester_id <> addressee_id);

alter table parks
  drop constraint if exists parks_external_source_allowed;
alter table parks
  add constraint parks_external_source_allowed
  check (
    external_source is null
    or external_source in ('wikidata', 'wikidata_unknown_park')
  );

alter table coasters
  drop constraint if exists coasters_external_source_allowed;
alter table coasters
  add constraint coasters_external_source_allowed
  check (external_source is null or external_source = 'wikidata');

create index if not exists idx_coasters_park_id on coasters(park_id);

-- Stable upsert for Wikidata catalog rows (see migrations/004_coasters_stable_upsert.sql).
create unique index if not exists coasters_park_source_external_uidx
  on coasters (park_id, external_source, external_id)
  where external_id is not null and external_source is not null;
create index if not exists idx_rides_user_id on rides(user_id);
create index if not exists idx_rides_coaster_id on rides(coaster_id);
create unique index if not exists ride_events_user_coaster_dated_uidx
  on ride_events (user_id, coaster_id, ridden_on)
  where ridden_on is not null;
create unique index if not exists ride_events_legacy_one_per_credit_uidx
  on ride_events (user_id, coaster_id)
  where ridden_on is null;
create index if not exists idx_ride_events_user_id on ride_events (user_id);
create index if not exists idx_ride_events_user_coaster on ride_events (user_id, coaster_id);
create index if not exists idx_ride_events_user_date on ride_events (user_id, ridden_on);
create index if not exists idx_ride_events_coaster_id on ride_events (coaster_id);
grant select, insert, update, delete on table ride_events to authenticated;
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
alter table ride_events enable row level security;
alter table wishlist enable row level security;
alter table sync_runs enable row level security;
alter table profiles enable row level security;
alter table friendships enable row level security;

drop policy if exists "public can read parks" on parks;
create policy "public can read parks" on parks for select using (true);

drop policy if exists "public can read coasters" on coasters;
create policy "public can read coasters" on coasters for select using (true);

create or replace function public.can_view_user_stats(owner uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select auth.uid()) is not null
    and owner is not null
    and (
      (select auth.uid()) = owner
      or exists (
        select 1
        from public.profiles p
        where p.user_id = owner
          and p.banned_at is null
          and (
            p.stats_visibility = 'public'
            or exists (
              select 1
              from public.friendships f
              where f.status = 'accepted'
                and (
                  (f.requester_id = (select auth.uid()) and f.addressee_id = owner)
                  or (f.addressee_id = (select auth.uid()) and f.requester_id = owner)
                )
            )
          )
      )
    );
$$;

revoke all on function public.can_view_user_stats(uuid) from public;
grant execute on function public.can_view_user_stats(uuid) to authenticated;

drop policy if exists "users can read own rides" on rides;
drop policy if exists "users can read own rides and accepted friends rides" on rides;
drop policy if exists "users can read visible rides" on rides;
create policy "users can read visible rides"
  on rides for select
  to authenticated
  using (public.can_view_user_stats(user_id));

drop policy if exists "users can create own rides" on rides;
create policy "users can create own rides" on rides for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own rides" on rides;
create policy "users can update own rides"
  on rides for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own rides" on rides;
create policy "users can delete own rides" on rides for delete using (auth.uid() = user_id);

drop policy if exists "users can read own ride events and accepted friends ride events" on ride_events;
drop policy if exists "users can read visible ride events" on ride_events;
create policy "users can read visible ride events"
  on ride_events for select
  to authenticated
  using (public.can_view_user_stats(user_id));

drop policy if exists "users can create own ride events" on ride_events;
create policy "users can create own ride events" on ride_events for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own ride events" on ride_events;
create policy "users can update own ride events"
  on ride_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own ride events" on ride_events;
create policy "users can delete own ride events" on ride_events for delete using (auth.uid() = user_id);

drop policy if exists "users can read own wishlist" on wishlist;
create policy "users can read own wishlist" on wishlist for select using (auth.uid() = user_id);

drop policy if exists "users can manage own wishlist" on wishlist;
create policy "users can manage own wishlist" on wishlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "no client access sync runs" on sync_runs;
create policy "no client access sync runs" on sync_runs for all using (false) with check (false);

drop policy if exists "users can read own profile" on profiles;
create policy "users can read own profile" on profiles for select using (auth.uid() = user_id);

drop policy if exists "authenticated can read public profiles" on profiles;
create policy "authenticated can read public profiles" on profiles for select to authenticated using (display_name is not null and banned_at is null);

drop policy if exists "users can insert own profile" on profiles;
create policy "users can insert own profile" on profiles for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own profile" on profiles;
create policy "users can update own profile" on profiles for update using (auth.uid() = user_id and banned_at is null) with check (auth.uid() = user_id and banned_at is null);

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

-- Count of accepted friendships for a user (self or accepted friend only).
create or replace function public.accepted_friend_count(target uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return null;
  end if;

  if auth.uid() = target
     or exists (
       select 1
       from public.profiles p
       where p.user_id = target
         and p.banned_at is null
         and p.stats_visibility = 'public'
     )
     or exists (
       select 1
       from public.friendships f
       where f.status = 'accepted'
         and (
           (f.requester_id = auth.uid() and f.addressee_id = target)
           or (f.addressee_id = auth.uid() and f.requester_id = target)
         )
     )
  then
    return (
      select count(*)::integer
      from public.friendships f
      where f.status = 'accepted'
        and (f.requester_id = target or f.addressee_id = target)
    );
  end if;

  return null;
end;
$$;

revoke all on function public.accepted_friend_count(uuid) from public;
grant execute on function public.accepted_friend_count(uuid) to authenticated;

create or replace function public.cascade_delete_ride_events()
returns trigger
language plpgsql
as $$
begin
  delete from ride_events
  where user_id = old.user_id
    and coaster_id = old.coaster_id;
  return old;
end;
$$;

drop trigger if exists trg_rides_delete_events on rides;
create trigger trg_rides_delete_events
before delete on rides
for each row
execute function public.cascade_delete_ride_events();

create or replace view public.ride_credit_summaries
with (security_invoker = true) as
select
  e.user_id,
  e.coaster_id,
  sum(e.quantity)::integer as total_rides,
  min(e.ridden_on) as first_ridden_on,
  max(e.ridden_on) as last_ridden_on
from ride_events e
where e.ridden_on is not null
   or not exists (
     select 1
     from ride_events d
     where d.user_id = e.user_id
       and d.coaster_id = e.coaster_id
       and d.ridden_on is not null
   )
group by e.user_id, e.coaster_id;

grant select on public.ride_credit_summaries to authenticated;

create or replace function public.log_ride_events(
  p_coaster_id bigint,
  p_ridden_on date,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  logged_qty integer;
  v_total integer;
  v_first date;
  v_last date;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_coaster_id is null then
    raise exception 'coaster_id is required';
  end if;
  if p_ridden_on is null then
    raise exception 'ridden_on is required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception 'quantity must be between 1 and 99';
  end if;

  insert into rides (user_id, coaster_id)
  values (uid, p_coaster_id)
  on conflict (user_id, coaster_id) do nothing;

  -- Same calendar day: increment only when the new total stays within 99.
  update ride_events
     set quantity = ride_events.quantity + p_quantity
   where ride_events.user_id = uid
     and ride_events.coaster_id = p_coaster_id
     and ride_events.ridden_on = p_ridden_on
     and ride_events.quantity + p_quantity <= 99
  returning ride_events.quantity into logged_qty;

  if not found then
    if exists (
      select 1
      from ride_events
      where ride_events.user_id = uid
        and ride_events.coaster_id = p_coaster_id
        and ride_events.ridden_on = p_ridden_on
    ) then
      raise exception 'Too many rides logged for this coaster on this date';
    end if;

    begin
      insert into ride_events (user_id, coaster_id, ridden_on, quantity, source)
      values (uid, p_coaster_id, p_ridden_on, p_quantity, 'user_log')
      returning ride_events.quantity into logged_qty;
    exception
      when unique_violation then
        update ride_events
           set quantity = ride_events.quantity + p_quantity
         where ride_events.user_id = uid
           and ride_events.coaster_id = p_coaster_id
           and ride_events.ridden_on = p_ridden_on
           and ride_events.quantity + p_quantity <= 99
        returning ride_events.quantity into logged_qty;

        if not found then
          raise exception 'Too many rides logged for this coaster on this date';
        end if;
    end;
  end if;

  delete from ride_events
  where ride_events.user_id = uid
    and ride_events.coaster_id = p_coaster_id
    and ride_events.ridden_on is null;

  delete from wishlist
  where wishlist.user_id = uid
    and wishlist.coaster_id = p_coaster_id;

  select
    coalesce(sum(ride_events.quantity), 0)::integer,
    min(ride_events.ridden_on),
    max(ride_events.ridden_on)
  into v_total, v_first, v_last
  from ride_events
  where ride_events.user_id = uid
    and ride_events.coaster_id = p_coaster_id;

  return jsonb_build_object(
    'coaster_id', p_coaster_id,
    'total_rides', v_total,
    'first_ridden_on', v_first,
    'last_ridden_on', v_last
  );
end;
$$;

revoke all on function public.log_ride_events(bigint, date, integer) from public;
grant execute on function public.log_ride_events(bigint, date, integer) to authenticated;

create or replace function public.adjust_ride_events(
  p_coaster_id bigint,
  p_ridden_on date,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  current_qty integer;
  event_id bigint;
  remaining integer;
  v_total integer;
  v_first date;
  v_last date;
  credit_removed boolean := false;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_coaster_id is null then
    raise exception 'coaster_id is required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception 'quantity must be between 1 and 99';
  end if;

  select ride_events.id, ride_events.quantity
    into event_id, current_qty
  from ride_events
  where ride_events.user_id = uid
    and ride_events.coaster_id = p_coaster_id
    and ride_events.ridden_on is not distinct from p_ridden_on
  for update;

  if event_id is null then
    raise exception 'No rides logged for this date';
  end if;

  if p_quantity >= current_qty then
    delete from ride_events
    where ride_events.id = event_id;
  else
    update ride_events
       set quantity = current_qty - p_quantity
     where ride_events.id = event_id;
  end if;

  select count(*)::integer
    into remaining
  from ride_events
  where ride_events.user_id = uid
    and ride_events.coaster_id = p_coaster_id;

  if remaining = 0 then
    delete from rides
    where rides.user_id = uid
      and rides.coaster_id = p_coaster_id;
    credit_removed := true;
  end if;

  select
    coalesce(sum(ride_events.quantity), 0)::integer,
    min(ride_events.ridden_on),
    max(ride_events.ridden_on)
  into v_total, v_first, v_last
  from ride_events
  where ride_events.user_id = uid
    and ride_events.coaster_id = p_coaster_id;

  return jsonb_build_object(
    'coaster_id', p_coaster_id,
    'total_rides', coalesce(v_total, 0),
    'first_ridden_on', v_first,
    'last_ridden_on', v_last,
    'credit_removed', credit_removed
  );
end;
$$;

revoke all on function public.adjust_ride_events(bigint, date, integer) from public;
grant execute on function public.adjust_ride_events(bigint, date, integer) to authenticated;
