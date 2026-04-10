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

create index if not exists idx_coasters_park_id on coasters(park_id);
create index if not exists idx_rides_user_id on rides(user_id);
create index if not exists idx_rides_coaster_id on rides(coaster_id);
create index if not exists idx_wishlist_coaster_id on wishlist(coaster_id);

alter table parks enable row level security;
alter table coasters enable row level security;
alter table rides enable row level security;
alter table wishlist enable row level security;
alter table sync_runs enable row level security;

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
