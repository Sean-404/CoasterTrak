-- Add favorite park to public social profile.

alter table profiles
  add column if not exists favorite_park text;

alter table profiles
  drop constraint if exists profiles_favorite_park_length;
alter table profiles
  add constraint profiles_favorite_park_length
  check (favorite_park is null or char_length(btrim(favorite_park)) between 1 and 80);
