-- Preset profile avatars (no uploaded images). Users pick an icon key.

alter table profiles
  add column if not exists avatar_key text;

alter table profiles
  drop constraint if exists profiles_avatar_key_allowed;

alter table profiles
  add constraint profiles_avatar_key_allowed
  check (
    avatar_key is null
    or avatar_key in (
      'loop',
      'hill',
      'corkscrew',
      'train',
      'launch',
      'drop',
      'track',
      'car'
    )
  );
