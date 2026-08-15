-- Profile photos for signed-in social features (friends, search, stats header).
-- Private bucket; readable by authenticated users who can already see the profile.

alter table public.profiles
  add column if not exists avatar_path text;

alter table public.profiles
  drop constraint if exists profiles_avatar_path_matches_owner;
alter table public.profiles
  add constraint profiles_avatar_path_matches_owner
    check (
      avatar_path is null
      or avatar_path = (user_id::text || '/avatar.jpg')
    );

create or replace function public.avatar_photo_owner(object_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.jpg$'
    then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

revoke all on function public.avatar_photo_owner(text) from public;
grant execute on function public.avatar_photo_owner(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  1048576,
  array['image/jpeg']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar owners can upload" on storage.objects;
create policy "Avatar owners can upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid()::text) || '/avatar.jpg'
  );

drop policy if exists "Avatar owners can update" on storage.objects;
create policy "Avatar owners can update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid()::text) || '/avatar.jpg'
  )
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid()::text) || '/avatar.jpg'
  );

drop policy if exists "Avatar owners can delete" on storage.objects;
create policy "Avatar owners can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid()::text) || '/avatar.jpg'
  );

drop policy if exists "Signed-in users can read profile avatars" on storage.objects;
create policy "Signed-in users can read profile avatars"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.avatar_photo_owner(name) = (select auth.uid())
      or exists (
        select 1
        from public.profiles p
        where p.user_id = public.avatar_photo_owner(name)
          and p.display_name is not null
          and p.banned_at is null
      )
    )
  );
