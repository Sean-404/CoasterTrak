-- Subtract rides from a specific day (or the undated legacy credit).
-- Returns jsonb so OUT columns cannot clash with ride_events.coaster_id.

create or replace function public.adjust_ride_events(
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
  current_qty integer;
  event_id bigint;
  remaining integer;
  v_total integer;
  v_first date;
  v_last date;
  credit_removed boolean := false;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_coaster_id is null then
    raise exception 'coaster_id is required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception 'quantity must be between 1 and 99';
  end if;

  select ride_events.id, ride_events.quantity
    into event_id, current_qty
  from ride_events
  where ride_events.user_id = uid
    and ride_events.coaster_id = p_coaster_id
    and ride_events.ridden_on is not distinct from p_ridden_on
  for update;

  if event_id is null then
    raise exception 'No rides logged for this date';
  end if;

  if p_quantity >= current_qty then
    delete from ride_events
    where ride_events.id = event_id;
  else
    update ride_events
       set quantity = current_qty - p_quantity
     where ride_events.id = event_id;
  end if;

  select count(*)::integer
    into remaining
  from ride_events
  where ride_events.user_id = uid
    and ride_events.coaster_id = p_coaster_id;

  if remaining = 0 then
    delete from rides
    where rides.user_id = uid
      and rides.coaster_id = p_coaster_id;
    credit_removed := true;
  end if;

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
    'total_rides', coalesce(v_total, 0),
    'first_ridden_on', v_first,
    'last_ridden_on', v_last,
    'credit_removed', credit_removed
  );
end;
$$;

revoke all on function public.adjust_ride_events(bigint, date, integer) from public;
grant execute on function public.adjust_ride_events(bigint, date, integer) to authenticated;

notify pgrst, 'reload schema';
