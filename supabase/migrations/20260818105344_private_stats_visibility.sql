-- Add private stats visibility. Friends-only remains the default.
-- Private profiles stay off the Users directory and people search; only the owner can see stats/photos.

alter table public.profiles
  drop constraint if exists profiles_stats_visibility_allowed;

alter table public.profiles
  add constraint profiles_stats_visibility_allowed
  check (stats_visibility in ('private', 'friends', 'public'));

create index if not exists idx_profiles_public_directory
  on public.profiles (display_name)
  where stats_visibility = 'public'
    and banned_at is null
    and display_name is not null;

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
            or (
              p.stats_visibility = 'friends'
              and exists (
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
      )
    );
$$;

revoke all on function public.can_view_user_stats(uuid) from public;
grant execute on function public.can_view_user_stats(uuid) to authenticated;

drop policy if exists "authenticated can read public profiles" on public.profiles;
create policy "authenticated can read public profiles"
  on public.profiles for select
  to authenticated
  using (
    display_name is not null
    and banned_at is null
    and (
      stats_visibility in ('friends', 'public')
      or exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = (select auth.uid()) and f.addressee_id = user_id)
            or (f.addressee_id = (select auth.uid()) and f.requester_id = user_id)
          )
      )
    )
  );

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
       from public.profiles p
       join public.friendships f
         on f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = target)
          or (f.addressee_id = auth.uid() and f.requester_id = target)
        )
       where p.user_id = target
         and p.banned_at is null
         and p.stats_visibility = 'friends'
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
