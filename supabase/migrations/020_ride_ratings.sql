-- Per-ride user ratings (1–5 stars) on ridden credits
alter table rides
  add column if not exists rating smallint
  check (rating is null or (rating >= 1 and rating <= 5));

-- Allow users to update their own ride rows (rating, and future fields)
drop policy if exists "users can update own rides" on rides;
create policy "users can update own rides"
  on rides for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
