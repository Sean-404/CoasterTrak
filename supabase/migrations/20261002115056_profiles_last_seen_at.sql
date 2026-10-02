-- Presence / last-active timestamp for admin "regularly on the site" views.
-- Updated by the client while signed in (throttled); not the same as auth last_sign_in_at.

alter table profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists idx_profiles_last_seen_at on profiles (last_seen_at desc nulls last);

-- Dedicated RPC so presence pings do not require a full profile update policy path
-- and stay cheap / idempotent under RLS.
create or replace function public.touch_profile_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update profiles
  set last_seen_at = now()
  where user_id = auth.uid()
    and banned_at is null
    and (
      last_seen_at is null
      or last_seen_at < now() - interval '5 minutes'
    );
end;
$$;

revoke all on function public.touch_profile_last_seen() from public;
grant execute on function public.touch_profile_last_seen() to authenticated;
