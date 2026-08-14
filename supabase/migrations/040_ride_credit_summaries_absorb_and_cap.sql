-- Ride credit totals should ignore an undated placeholder once a real ride day
-- exists (same rule as summarizeRideEvents). Also refuse a 99+ day total before
-- the quantity CHECK constraint fires with a cryptic error.

create or replace view public.ride_credit_summaries
with (security_invoker = true) as
select
  e.user_id,
  e.coaster_id,
  sum(e.quantity)::integer as total_rides,
  min(e.ridden_on) as first_ridden_on,
  max(e.ridden_on) as last_ridden_on
from ride_events e
where e.ridden_on is not null
   or not exists (
     select 1
     from ride_events d
     where d.user_id = e.user_id
       and d.coaster_id = e.coaster_id
       and d.ridden_on is not null
   )
group by e.user_id, e.coaster_id;

grant select on public.ride_credit_summaries to authenticated;

create or replace function public.log_ride_events(
  p_coaster_id bigint,
  p_ridden_on date,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  logged_qty integer;
  v_total integer;
  v_first date;
  v_last date;
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

  insert into rides (user_id, coaster_id)
  values (uid, p_coaster_id)
  on conflict (user_id, coaster_id) do nothing;

  update ride_events
     set quantity = ride_events.quantity + p_quantity
   where ride_events.user_id = uid
     and ride_events.coaster_id = p_coaster_id
     and ride_events.ridden_on = p_ridden_on
     and ride_events.quantity + p_quantity <= 99
  returning ride_events.quantity into logged_qty;

  if not found then
    if exists (
      select 1
      from ride_events
      where ride_events.user_id = uid
        and ride_events.coaster_id = p_coaster_id
        and ride_events.ridden_on = p_ridden_on
    ) then
      raise exception 'Too many rides logged for this coaster on this date';
    end if;

    begin
      insert into ride_events (user_id, coaster_id, ridden_on, quantity, source)
      values (uid, p_coaster_id, p_ridden_on, p_quantity, 'user_log')
      returning ride_events.quantity into logged_qty;
    exception
      when unique_violation then
        update ride_events
           set quantity = ride_events.quantity + p_quantity
         where ride_events.user_id = uid
           and ride_events.coaster_id = p_coaster_id
           and ride_events.ridden_on = p_ridden_on
           and ride_events.quantity + p_quantity <= 99
        returning ride_events.quantity into logged_qty;

        if not found then
          raise exception 'Too many rides logged for this coaster on this date';
        end if;
    end;
  end if;

  delete from ride_events
  where ride_events.user_id = uid
    and ride_events.coaster_id = p_coaster_id
    and ride_events.ridden_on is null;

  delete from wishlist
  where wishlist.user_id = uid
    and wishlist.coaster_id = p_coaster_id;

  select
    coalesce(sum(ride_events.quantity), 0)::integer,
    min(ride_events.ridden_on),
    max(ride_events.ridden_on)
  into v_total, v_first, v_last
  from ride_events
  where ride_events.user_id = uid
    and ride_events.coaster_id = p_coaster_id;

  return jsonb_build_object(
    'coaster_id', p_coaster_id,
    'total_rides', v_total,
    'first_ridden_on', v_first,
    'last_ridden_on', v_last
  );
end;
$$;

notify pgrst, 'reload schema';
