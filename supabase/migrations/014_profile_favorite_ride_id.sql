-- Enforce favorite ride selection from catalog rows.

alter table profiles
  add column if not exists favorite_ride_id bigint references coasters(id) on delete set null;

create index if not exists idx_profiles_favorite_ride_id on profiles(favorite_ride_id);
