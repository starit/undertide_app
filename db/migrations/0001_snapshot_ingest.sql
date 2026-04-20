create table if not exists snapshot_spaces (
  id text primary key,
  name text not null,
  about text,
  network text,
  symbol text,
  admins jsonb not null default '[]'::jsonb,
  member_count integer not null default 0,
  strategies jsonb not null default '[]'::jsonb,
  filters jsonb,
  plugins jsonb,
  raw jsonb not null,
  snapshot_created_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists idx_snapshot_spaces_network on snapshot_spaces(network);
create index if not exists idx_snapshot_spaces_last_seen_at on snapshot_spaces(last_seen_at desc);

create table if not exists snapshot_space_members (
  space_id text not null references snapshot_spaces(id) on delete cascade,
  member_address text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (space_id, member_address)
);

create index if not exists idx_snapshot_space_members_member_address on snapshot_space_members(member_address);
create index if not exists idx_snapshot_space_members_space_id on snapshot_space_members(space_id);

create table if not exists snapshot_proposals (
  id text primary key,
  space_id text not null references snapshot_spaces(id) on delete cascade,
  title text not null,
  body text,
  choices jsonb not null default '[]'::jsonb,
  start_ts bigint not null,
  end_ts bigint not null,
  created_ts bigint not null,
  start_at timestamptz generated always as (to_timestamp(start_ts)) stored,
  end_at timestamptz generated always as (to_timestamp(end_ts)) stored,
  created_at timestamptz generated always as (to_timestamp(created_ts)) stored,
  snapshot_block text,
  state text not null,
  author text not null,
  network text,
  scores jsonb,
  scores_by_strategy jsonb,
  scores_total numeric,
  scores_updated_ts bigint,
  scores_updated_at timestamptz generated always as (
    case
      when scores_updated_ts is null then null
      else to_timestamp(scores_updated_ts)
    end
  ) stored,
  strategies jsonb not null default '[]'::jsonb,
  plugins jsonb,
  raw jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists idx_snapshot_proposals_space_id on snapshot_proposals(space_id);
create index if not exists idx_snapshot_proposals_state on snapshot_proposals(state);
create index if not exists idx_snapshot_proposals_created_at on snapshot_proposals(created_at desc);
create index if not exists idx_snapshot_proposals_end_at on snapshot_proposals(end_at desc);
create index if not exists idx_snapshot_proposals_author on snapshot_proposals(author);

create table if not exists proposal_enrichments (
  proposal_id text primary key references snapshot_proposals(id) on delete cascade,
  readable_content text,
  ai_summary text,
  importance_label text,
  risk_labels jsonb not null default '[]'::jsonb,
  facts jsonb not null default '[]'::jsonb,
  locale text not null default 'en',
  updated_at timestamptz not null default now()
);

create table if not exists snapshot_sync_state (
  entity_type text primary key,
  last_success_at timestamptz,
  last_cursor text,
  last_created_ts bigint,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists snapshot_sync_runs (
  id bigserial primary key,
  entity_type text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  rows_upserted integer not null default 0,
  error text
);

create index if not exists idx_snapshot_sync_runs_entity_type on snapshot_sync_runs(entity_type);
create index if not exists idx_snapshot_sync_runs_started_at on snapshot_sync_runs(started_at desc);
