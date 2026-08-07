-- Count of accepted friendships for a user.
-- Callable by the user themselves, or by an accepted friend (returns count only, not identities).
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
