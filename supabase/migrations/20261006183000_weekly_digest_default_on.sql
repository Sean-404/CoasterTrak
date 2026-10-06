-- Weekly digest ON by default (same pattern as friend emails). Users can opt out at signup or in Account.

alter table public.profiles
  alter column notify_weekly_digest set default true;

update public.profiles
set notify_weekly_digest = true
where notify_weekly_digest is distinct from true;

comment on column public.profiles.notify_weekly_digest is
  'Sunday weekly credit summary email. Default true; user can opt out at signup or in Account.';
