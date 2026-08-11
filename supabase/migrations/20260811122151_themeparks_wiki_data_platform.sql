-- CoasterTrak Data (Phase 1): ThemeParks.wiki match + review queue
-- File-based match reports remain the primary Phase 1 output; these tables
-- persist runs/findings when scripts/match-themeparks-wiki.ts --write-db is used.

create table if not exists data_match_runs (
  id bigint generated always as identity primary key,
  source text not null default 'themeparks_wiki',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'failed')),
  parks_compared integer not null default 0,
  coasters_matched integer not null default 0,
  coasters_unmatched integer not null default 0,
  report_path text,
  error text
);

create table if not exists data_park_source_links (
  id bigint generated always as identity primary key,
  park_id bigint not null references parks(id) on delete cascade,
  source text not null default 'themeparks_wiki',
  external_id text not null,
  external_name text,
  match_method text not null check (match_method in ('seed', 'name', 'manual')),
  confidence real not null default 1.0 check (confidence >= 0 and confidence <= 1),
  last_verified_at timestamptz not null default now(),
  unique (source, external_id),
  unique (park_id, source)
);

create table if not exists data_coaster_source_links (
  id bigint generated always as identity primary key,
  coaster_id bigint not null references coasters(id) on delete cascade,
  source text not null default 'themeparks_wiki',
  external_id text not null,
  external_name text,
  match_method text not null check (match_method in ('exact_key', 'fuzzy', 'manual')),
  confidence real not null default 1.0 check (confidence >= 0 and confidence <= 1),
  last_verified_at timestamptz not null default now(),
  unique (source, external_id),
  unique (coaster_id, source)
);

create table if not exists data_review_findings (
  id bigint generated always as identity primary key,
  run_id bigint references data_match_runs(id) on delete set null,
  park_id bigint references parks(id) on delete cascade,
  coaster_id bigint references coasters(id) on delete set null,
  finding_type text not null check (
    finding_type in (
      'local_coaster_missing_in_source',
      'source_attraction_unmatched',
      'park_unmapped',
      'name_mismatch_candidate'
    )
  ),
  severity text not null default 'info' check (severity in ('info', 'warn', 'high')),
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists data_review_findings_open_idx
  on data_review_findings (status, finding_type)
  where status = 'open';

create index if not exists data_park_source_links_park_idx
  on data_park_source_links (park_id);

create index if not exists data_coaster_source_links_coaster_idx
  on data_coaster_source_links (coaster_id);

alter table data_match_runs enable row level security;
alter table data_park_source_links enable row level security;
alter table data_coaster_source_links enable row level security;
alter table data_review_findings enable row level security;

-- Service-role scripts write these; anon/authenticated have no policies (deny by default).
