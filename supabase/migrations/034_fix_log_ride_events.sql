-- Replace log_ride_events: increment same-day rows instead of ON CONFLICT
-- on a partial unique index (which can fail to match and block +1).
-- Undated legacy credits and other dates are left in place.

create or replace function public.log_ride_events(
  p_coaster_id bigint,
  p_ridden_on date,
  p_quantity integer default 1
)
returns table (
  coaster_id bigint,
  total_rides integer,
  first_ridden_on date,
  last_ridden_on date
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  logged_qty integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_coaster_id is null then
    raise exception 'coaster_id is required';
  end if;
  if p_ridden_on is null then
    raise exception 'ridden_on is required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception 'quantity must be between 1 and 99';
  end if;

  insert into rides as r (user_id, coaster_id)
  values (uid, p_coaster_id)
  on conflict (user_id, coaster_id) do nothing;

  update ride_events as re
     set quantity = re.quantity + p_quantity
   where re.user_id = uid
     and re.coaster_id = p_coaster_id
     and re.ridden_on = p_ridden_on
  returning re.quantity into logged_qty;

  if not found then
    begin
      insert into ride_events as re (user_id, coaster_id, ridden_on, quantity, source)
      values (uid, p_coaster_id, p_ridden_on, p_quantity, 'user_log')
      returning re.quantity into logged_qty;
    exception
      when unique_violation then
        update ride_events as re
           set quantity = re.quantity + p_quantity
         where re.user_id = uid
           and re.coaster_id = p_coaster_id
           and re.ridden_on = p_ridden_on
        returning re.quantity into logged_qty;
    end;
  end if;

  if logged_qty > 99 then
    raise exception 'Too many rides logged for this coaster on this date';
  end if;

  delete from wishlist as w
  where w.user_id = uid
    and w.coaster_id = p_coaster_id;

  return query
  select
    p_coaster_id,
    coalesce(sum(e.quantity), 0)::integer,
    min(e.ridden_on),
    max(e.ridden_on)
  from ride_events e
  where e.user_id = uid
    and e.coaster_id = p_coaster_id;
end;
$$;

revoke all on function public.log_ride_events(bigint, date, integer) from public;
grant execute on function public.log_ride_events(bigint, date, integer) to authenticated;

notify pgrst, 'reload schema';
