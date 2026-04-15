-- Enforce favorite park selection from catalog rows.

alter table profiles
  add column if not exists favorite_park_id bigint references parks(id) on delete set null;

create index if not exists idx_profiles_favorite_park_id on profiles(favorite_park_id);
