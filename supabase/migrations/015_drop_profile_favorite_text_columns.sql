-- Remove legacy free-text profile favorites; keep catalog-backed ids only.
alter table profiles
  drop constraint if exists profiles_favorite_ride_length;

alter table profiles
  drop constraint if exists profiles_favorite_park_length;

alter table profiles
  drop column if exists favorite_ride;

alter table profiles
  drop column if exists favorite_park;
