-- Member-written park reviews, shown on park pages once a moderator approves them.
--
-- RLS is on with no policies: only the service role (the Next.js API routes and server
-- pages) reads or writes these tables. Routes validate input, check bans and rate limits,
-- and return only display fields, so user ids never reach the browser.
--
-- Every new or edited review starts as 'pending'. A moderator sets 'approved' or 'hidden'
-- in /admin/reviews. Reports from members go to park_review_reports.

create table if not exists public.park_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  park_id bigint not null references public.parks(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  body text not null check (char_length(body) between 200 and 4000),
  visited_year smallint check (visited_year between 1950 and 2100),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint park_reviews_one_per_member unique (user_id, park_id)
);

create index if not exists park_reviews_park_status_idx on public.park_reviews (park_id, status);
create index if not exists park_reviews_status_updated_idx on public.park_reviews (status, updated_at desc);
create index if not exists park_reviews_user_updated_idx on public.park_reviews (user_id, updated_at desc);

create table if not exists public.park_review_reports (
  id bigint generated always as identity primary key,
  review_id bigint not null references public.park_reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint park_review_reports_one_per_member unique (review_id, reporter_id)
);

create index if not exists park_review_reports_open_idx
  on public.park_review_reports (review_id)
  where resolved_at is null;

create or replace function public.touch_park_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists park_reviews_touch_updated_at on public.park_reviews;
create trigger park_reviews_touch_updated_at
  before update on public.park_reviews
  for each row execute function public.touch_park_reviews_updated_at();

alter table public.park_reviews enable row level security;
alter table public.park_review_reports enable row level security;

revoke all on public.park_reviews from anon, authenticated;
revoke all on public.park_review_reports from anon, authenticated;

comment on table public.park_reviews is
  'Member park reviews. Service role only; shown publicly once status = approved.';
comment on table public.park_review_reports is
  'Member reports against park reviews, cleared by a moderator in /admin/reviews.';
