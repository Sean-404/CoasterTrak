create table if not exists parks (
  id bigint generated always as identity primary key,
  name text not null,
  country text not null,
  latitude double precision not null,
  longitude double precision not null
);

create table if not exists coasters (
  id bigint generated always as identity primary key,
  park_id bigint not null references parks(id) on delete cascade,
  name text not null,
  coaster_type text not null,
  status text not null default 'Operating'
);

create table if not exists rides (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  coaster_id bigint not null references coasters(id) on delete cascade,
  ridden_at timestamptz not null default now()
);

create table if not exists wishlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  coaster_id bigint not null references coasters(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, coaster_id)
);

alter table parks enable row level security;
alter table coasters enable row level security;
alter table rides enable row level security;
alter table wishlist enable row level security;

drop policy if exists "public can read parks" on parks;
create policy "public can read parks" on parks for select using (true);

drop policy if exists "public can read coasters" on coasters;
create policy "public can read coasters" on coasters for select using (true);

drop policy if exists "users can read own rides" on rides;
create policy "users can read own rides" on rides for select using (auth.uid() = user_id);

drop policy if exists "users can create own rides" on rides;
create policy "users can create own rides" on rides for insert with check (auth.uid() = user_id);

drop policy if exists "users can read own wishlist" on wishlist;
create policy "users can read own wishlist" on wishlist for select using (auth.uid() = user_id);

drop policy if exists "users can manage own wishlist" on wishlist;
create policy "users can manage own wishlist" on wishlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
