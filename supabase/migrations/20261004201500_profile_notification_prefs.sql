-- Transactional email preferences for friend activity.
-- Defaults ON for new and existing users; they can opt out in Account or via email link.

alter table public.profiles
  add column if not exists notify_friend_requests boolean not null default true;

alter table public.profiles
  add column if not exists notify_friend_accepted boolean not null default true;

comment on column public.profiles.notify_friend_requests is
  'Email when someone sends this user a friend request. Default true; user can opt out.';

comment on column public.profiles.notify_friend_accepted is
  'Email when someone accepts this user''s friend request. Default true; user can opt out.';
