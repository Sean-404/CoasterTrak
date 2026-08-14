-- Ride history: event-level logs while `rides` remains the unique-credit + rating hub.
-- Existing credits are copied as one undated event each (ridden_on is null on purpose —
-- rides.ridden_at is log time, not a real ride day).
--
-- Reverse (dev/staging only, after confirming no user_log rows you need):
--   delete from ride_events where source = 'legacy_credit';
--   drop trigger if exists trg_rides_delete_events on rides;
--   drop function if exists public.cascade_delete_ride_events();
--   drop function if exists public.log_ride_events(bigint, date, integer);
--   drop view if exists public.ride_credit_summaries;
--   drop table if exists public.ride_events;

create table if not exists ride_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  coaster_id bigint not null references coasters(id) on delete cascade,
  ridden_on date,
  quantity integer not null default 1,
  source text not null default 'user_log',
  created_at timestamptz not null default now(),
  constraint ride_events_quantity_range check (quantity >= 1 and quantity <= 99),
  constraint ride_events_source_allowed check (source in ('legacy_credit', 'user_log'))
);

comment on table ride_events is
  'Individual ride logs. Unique credits still live on rides; this table stores counts and dates.';
comment on column ride_events.ridden_on is
  'Calendar day of the ride in the user''s local date. Null means unknown (migrated credit).';
comment on column ride_events.quantity is
  'Rides of this coaster on this date (or undated legacy credit). Configurable cap is 99.';
comment on column ride_events.source is
  'legacy_credit = backfilled from rides; user_log = explicit log from the app.';

create unique index if not exists ride_events_user_coaster_dated_uidx
  on ride_events (user_id, coaster_id, ridden_on)
  where ridden_on is not null;

create unique index if not exists ride_events_legacy_one_per_credit_uidx
  on ride_events (user_id, coaster_id)
  where ridden_on is null;

grant select, insert, update, delete on table ride_events to authenticated;

create index if not exists idx_ride_events_user_id on ride_events (user_id);
create index if not exists idx_ride_events_user_coaster on ride_events (user_id, coaster_id);
create index if not exists idx_ride_events_user_date on ride_events (user_id, ridden_on);
create index if not exists idx_ride_events_coaster_id on ride_events (coaster_id);

alter table ride_events enable row level security;

drop policy if exists "users can read own ride events and accepted friends ride events" on ride_events;
create policy "users can read own ride events and accepted friends ride events"
  on ride_events for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = ride_events.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = ride_events.user_id)
        )
    )
  );

drop policy if exists "users can create own ride events" on ride_events;
create policy "users can create own ride events"
  on ride_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can update own ride events" on ride_events;
create policy "users can update own ride events"
  on ride_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own ride events" on ride_events;
create policy "users can delete own ride events"
  on ride_events for delete
  using (auth.uid() = user_id);

-- Removing a unique credit also removes that coaster's ride history.
create or replace function public.cascade_delete_ride_events()
returns trigger
language plpgsql
as $$
begin
  delete from ride_events
  where user_id = old.user_id
    and coaster_id = old.coaster_id;
  return old;
end;
$$;

drop trigger if exists trg_rides_delete_events on rides;
create trigger trg_rides_delete_events
before delete on rides
for each row
execute function public.cascade_delete_ride_events();

-- Per-coaster aggregates for a user (and readable friends via ride_events RLS).
create or replace view public.ride_credit_summaries
with (security_invoker = true) as
select
  user_id,
  coaster_id,
  sum(quantity)::integer as total_rides,
  min(ridden_on) as first_ridden_on,
  max(ridden_on) as last_ridden_on
from ride_events
group by user_id, coaster_id;

grant select on public.ride_credit_summaries to authenticated;

-- Atomic first-credit + additional-ride log. Date comes from the client (local calendar day).
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

  -- Same calendar day: increment. Other days / undated legacy credits stay as separate rows.
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

-- Idempotent backfill: one undated event per existing unique credit.
insert into ride_events (user_id, coaster_id, ridden_on, quantity, source, created_at)
select r.user_id, r.coaster_id, null, 1, 'legacy_credit', r.ridden_at
from rides r
where not exists (
  select 1
  from ride_events e
  where e.user_id = r.user_id
    and e.coaster_id = r.coaster_id
    and e.ridden_on is null
);

notify pgrst, 'reload schema';
