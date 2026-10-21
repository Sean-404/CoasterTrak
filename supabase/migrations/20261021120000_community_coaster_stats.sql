-- Anonymous community stats for public coaster and park pages.
-- Returns only per-coaster aggregates; no user ids or per-user rows leave the database.
-- A metric is returned only when at least 5 distinct users contribute to it (k-anonymity
-- threshold); otherwise it is null, and coasters with no qualifying metric are omitted.
-- Members with private stats and banned accounts are never counted. Accounts without a
-- profile row count as the default (friends-only), matching profiles.stats_visibility.

create or replace function public.community_coaster_stats()
returns table (
  coaster_id bigint,
  rider_count integer,
  rating_count integer,
  average_rating numeric,
  wishlist_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with excluded_users as (
    select p.user_id
    from public.profiles p
    where p.stats_visibility = 'private'
       or p.banned_at is not null
  ),
  ride_totals as (
    -- rides holds one unique credit (and optional rating) per user and coaster.
    select
      r.coaster_id,
      count(distinct r.user_id)::integer as rider_count,
      count(distinct r.user_id) filter (where r.rating is not null)::integer as rating_count,
      avg(r.rating) as average_rating
    from public.rides r
    where not exists (select 1 from excluded_users e where e.user_id = r.user_id)
    group by r.coaster_id
  ),
  wishlist_totals as (
    select
      w.coaster_id,
      count(distinct w.user_id)::integer as wishlist_count
    from public.wishlist w
    where not exists (select 1 from excluded_users e where e.user_id = w.user_id)
    group by w.coaster_id
  )
  select
    coalesce(rt.coaster_id, wt.coaster_id) as coaster_id,
    case when rt.rider_count >= 5 then rt.rider_count end as rider_count,
    case when rt.rating_count >= 5 then rt.rating_count end as rating_count,
    case when rt.rating_count >= 5 then round(rt.average_rating, 1) end as average_rating,
    case when wt.wishlist_count >= 5 then wt.wishlist_count end as wishlist_count
  from ride_totals rt
  full join wishlist_totals wt on wt.coaster_id = rt.coaster_id
  where rt.rider_count >= 5
     or wt.wishlist_count >= 5
  order by 1;
$$;

comment on function public.community_coaster_stats() is
  'Anonymous per-coaster rider, rating and wishlist totals. Each metric is null below 5 contributors; private and banned users are excluded.';

revoke all on function public.community_coaster_stats() from public;
grant execute on function public.community_coaster_stats() to anon, authenticated;
