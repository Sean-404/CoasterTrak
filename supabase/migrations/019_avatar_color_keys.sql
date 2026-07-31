-- Switch avatar_key from coaster icon ids to color ids (initials avatars).

alter table profiles
  drop constraint if exists profiles_avatar_key_allowed;

update profiles
set avatar_key = case avatar_key
  when 'loop' then 'rose'
  when 'hill' then 'sky'
  when 'corkscrew' then 'violet'
  when 'train' then 'amber'
  when 'launch' then 'orange'
  when 'drop' then 'emerald'
  when 'track' then 'slate'
  when 'car' then 'cyan'
  else avatar_key
end
where avatar_key in ('loop', 'hill', 'corkscrew', 'train', 'launch', 'drop', 'track', 'car');

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
