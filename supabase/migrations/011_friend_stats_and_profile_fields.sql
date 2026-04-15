-- Allow richer social profiles and friend stat comparisons.

alter table profiles
  add column if not exists favorite_ride text;

alter table profiles
  drop constraint if exists profiles_favorite_ride_length;
alter table profiles
  add constraint profiles_favorite_ride_length
  check (favorite_ride is null or char_length(btrim(favorite_ride)) between 1 and 80);

drop policy if exists "users can read own rides" on rides;
drop policy if exists "users can read own rides and accepted friends rides" on rides;
create policy "users can read own rides and accepted friends rides"
  on rides for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = rides.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = rides.user_id)
        )
    )
  );
