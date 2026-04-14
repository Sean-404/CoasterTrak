-- User profiles with moderated public display names.
-- Security model: users can only manage their own profile row via RLS.

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  country_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles
  add column if not exists display_name text,
  add column if not exists country_code text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

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

create index if not exists idx_profiles_display_name on profiles(display_name);

alter table profiles enable row level security;

drop policy if exists "users can read own profile" on profiles;
create policy "users can read own profile"
  on profiles for select
  using (auth.uid() = user_id);

drop policy if exists "users can insert own profile" on profiles;
create policy "users can insert own profile"
  on profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can update own profile" on profiles;
create policy "users can update own profile"
  on profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own profile" on profiles;
create policy "users can delete own profile"
  on profiles for delete
  using (auth.uid() = user_id);
