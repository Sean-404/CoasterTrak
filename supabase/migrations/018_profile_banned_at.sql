-- Track bans on profiles for admin tooling and public visibility filters.

alter table profiles
  add column if not exists banned_at timestamptz;

alter table profiles
  add column if not exists ban_reason text;

alter table profiles
  drop constraint if exists profiles_ban_reason_length;

alter table profiles
  add constraint profiles_ban_reason_length
  check (ban_reason is null or char_length(btrim(ban_reason)) between 1 and 200);

-- Hide banned profiles from social discovery.
drop policy if exists "authenticated can read public profiles" on profiles;
create policy "authenticated can read public profiles"
  on profiles for select to authenticated
  using (display_name is not null and banned_at is null);

-- Banned users cannot update their own profile while banned.
drop policy if exists "users can update own profile" on profiles;
create policy "users can update own profile"
  on profiles for update
  using (auth.uid() = user_id and banned_at is null)
  with check (auth.uid() = user_id and banned_at is null);
