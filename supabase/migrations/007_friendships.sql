-- Friend request and connection graph.
-- Users can send and respond to requests while RLS keeps rows private to participants.

create table if not exists friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);

alter table friendships
  add column if not exists requester_id uuid references auth.users(id) on delete cascade,
  add column if not exists addressee_id uuid references auth.users(id) on delete cascade,
  add column if not exists status text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists responded_at timestamptz;

alter table friendships
  alter column requester_id set not null,
  alter column addressee_id set not null,
  alter column status set not null;

alter table friendships
  drop constraint if exists friendships_status_check;
alter table friendships
  add constraint friendships_status_check
  check (status in ('pending', 'accepted', 'declined', 'blocked'));

alter table friendships
  drop constraint if exists friendships_not_self;
alter table friendships
  add constraint friendships_not_self check (requester_id <> addressee_id);

create unique index if not exists friendships_pair_uidx
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists idx_friendships_requester on friendships(requester_id);
create index if not exists idx_friendships_addressee on friendships(addressee_id);
create index if not exists idx_friendships_status on friendships(status);

create or replace function public.touch_friendships_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status <> old.status and new.status in ('accepted', 'declined', 'blocked') then
    new.responded_at := coalesce(new.responded_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_friendships_updated_at on friendships;
create trigger trg_friendships_updated_at
before update on friendships
for each row
execute function public.touch_friendships_updated_at();

alter table friendships enable row level security;

drop policy if exists "users can read their friendships" on friendships;
create policy "users can read their friendships"
  on friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "users can create friendship requests" on friendships;
create policy "users can create friendship requests"
  on friendships for insert
  with check (auth.uid() = requester_id and requester_id <> addressee_id);

drop policy if exists "users can update their friendships" on friendships;
create policy "users can update their friendships"
  on friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "users can delete their friendships" on friendships;
create policy "users can delete their friendships"
  on friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Needed for friend search and public leaderboards (no PII columns in this table).
drop policy if exists "authenticated can read public profiles" on profiles;
create policy "authenticated can read public profiles"
  on profiles for select
  to authenticated
  using (display_name is not null);
