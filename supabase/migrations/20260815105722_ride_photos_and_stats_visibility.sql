-- One cover photo per ride credit, plus friends-only vs public stats visibility.
-- Photos live in a private bucket; signed URLs are issued to viewers who can already see stats.

alter table public.profiles
  add column if not exists stats_visibility text not null default 'friends';

alter table public.profiles
  drop constraint if exists profiles_stats_visibility_allowed;
alter table public.profiles
  add constraint profiles_stats_visibility_allowed
    check (stats_visibility in ('friends', 'public'));

alter table public.rides
  add column if not exists photo_path text;

alter table public.rides
  drop constraint if exists rides_photo_path_matches_owner;
alter table public.rides
  add constraint rides_photo_path_matches_owner
    check (
      photo_path is null
      or photo_path = (user_id::text || '/' || coaster_id::text || '.jpg')
    );

create or replace function public.can_view_user_stats(owner uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select auth.uid()) is not null
    and owner is not null
    and (
      (select auth.uid()) = owner
      or exists (
        select 1
        from public.profiles p
        where p.user_id = owner
          and p.banned_at is null
          and (
            p.stats_visibility = 'public'
            or exists (
              select 1
              from public.friendships f
              where f.status = 'accepted'
                and (
                  (f.requester_id = (select auth.uid()) and f.addressee_id = owner)
                  or (f.addressee_id = (select auth.uid()) and f.requester_id = owner)
                )
            )
          )
      )
    );
$$;

revoke all on function public.can_view_user_stats(uuid) from public;
grant execute on function public.can_view_user_stats(uuid) to authenticated;

create or replace function public.ride_photo_owner(object_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]+\.jpg$'
    then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

revoke all on function public.ride_photo_owner(text) from public;
grant execute on function public.ride_photo_owner(text) to authenticated;

drop policy if exists "users can read own rides and accepted friends rides" on public.rides;
drop policy if exists "users can read visible rides" on public.rides;
create policy "users can read visible rides"
  on public.rides for select
  to authenticated
  using (public.can_view_user_stats(user_id));

drop policy if exists "users can read own ride events and accepted friends ride events" on public.ride_events;
drop policy if exists "users can read visible ride events" on public.ride_events;
create policy "users can read visible ride events"
  on public.ride_events for select
  to authenticated
  using (public.can_view_user_stats(user_id));

create or replace function public.accepted_friend_count(target uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return null;
  end if;

  if auth.uid() = target
     or exists (
       select 1
       from public.profiles p
       where p.user_id = target
         and p.banned_at is null
         and p.stats_visibility = 'public'
     )
     or exists (
       select 1
       from public.friendships f
       where f.status = 'accepted'
         and (
           (f.requester_id = auth.uid() and f.addressee_id = target)
           or (f.addressee_id = auth.uid() and f.requester_id = target)
         )
     )
  then
    return (
      select count(*)::integer
      from public.friendships f
      where f.status = 'accepted'
        and (f.requester_id = target or f.addressee_id = target)
    );
  end if;

  return null;
end;
$$;

revoke all on function public.accepted_friend_count(uuid) from public;
grant execute on function public.accepted_friend_count(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ride-photos',
  'ride-photos',
  false,
  2097152,
  array['image/jpeg']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Ride photo owners can upload" on storage.objects;
create policy "Ride photo owners can upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ride-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.extension(name) = 'jpg'
  );

drop policy if exists "Ride photo owners can update" on storage.objects;
create policy "Ride photo owners can update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'ride-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'ride-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and storage.extension(name) = 'jpg'
  );

drop policy if exists "Ride photo owners can delete" on storage.objects;
create policy "Ride photo owners can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ride-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Visible ride photos can be read" on storage.objects;
create policy "Visible ride photos can be read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ride-photos'
    and public.can_view_user_stats(public.ride_photo_owner(name))
  );
