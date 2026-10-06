-- Weekly digest opt-in (default OFF — digests are quieter than friend alerts).

alter table public.profiles
  add column if not exists notify_weekly_digest boolean not null default false;

comment on column public.profiles.notify_weekly_digest is
  'Sunday weekly credit summary email. Default false; user must opt in from Account.';
