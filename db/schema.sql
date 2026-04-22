create table if not exists snapshot_spaces (
  id text primary key,
  name text not null,
  about text,
  avatar text,
  network text,
  symbol text,
  verified boolean not null default false,
  categories jsonb not null default '[]'::jsonb,
  followers_count integer not null default 0,
  votes_count integer not null default 0,
  twitter text,
  github text,
  coingecko text,
  website text,
  discussions text,
  flagged boolean not null default false,
  flag_code integer not null default 0,
  hibernated boolean not null default false,
  turbo boolean not null default false,
  active_proposals integer not null default 0,
  admins jsonb not null default '[]'::jsonb,
  member_count integer not null default 0,
  proposal_count integer not null default 0,
  strategies jsonb not null default '[]'::jsonb,
  filters jsonb,
  plugins jsonb,
  raw jsonb not null,
  snapshot_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_snapshot_spaces_network on snapshot_spaces(network);
create index if not exists idx_snapshot_spaces_created_at on snapshot_spaces(created_at desc);

create table if not exists snapshot_space_members (
  space_id text not null,
  member_address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (space_id, member_address)
);

create index if not exists idx_snapshot_space_members_member_address on snapshot_space_members(member_address);
create index if not exists idx_snapshot_space_members_space_id on snapshot_space_members(space_id);

create table if not exists snapshot_proposals (
  id text primary key,
  space_id text not null,
  title text not null,
  body text,
  choices jsonb not null default '[]'::jsonb,
  start_ts bigint not null,
  end_ts bigint not null,
  created_ts bigint not null,
  start_at timestamptz generated always as (to_timestamp(start_ts)) stored,
  end_at timestamptz generated always as (to_timestamp(end_ts)) stored,
  created_at timestamptz generated always as (to_timestamp(created_ts)) stored,
  ipfs text,
  type text,
  discussion text,
  flagged boolean not null default false,
  flag_code integer not null default 0,
  symbol text,
  labels jsonb not null default '[]'::jsonb,
  quorum numeric,
  quorum_type text,
  privacy text,
  link text,
  app text,
  snapshot_block text,
  state text not null,
  author text not null,
  network text,
  scores jsonb,
  scores_by_strategy jsonb,
  scores_total numeric,
  scores_state text,
  scores_total_value numeric,
  scores_updated_ts bigint,
  scores_updated_at timestamptz generated always as (
    case
      when scores_updated_ts is null then null
      else to_timestamp(scores_updated_ts)
    end
  ) stored,
  votes_count integer not null default 0,
  updated_ts bigint,
  updated_at timestamptz generated always as (
    case
      when updated_ts is null then null
      else to_timestamp(updated_ts)
    end
  ) stored,
  strategies jsonb not null default '[]'::jsonb,
  plugins jsonb,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);

create index if not exists idx_snapshot_proposals_space_id on snapshot_proposals(space_id);
create index if not exists idx_snapshot_proposals_state on snapshot_proposals(state);
create index if not exists idx_snapshot_proposals_created_at on snapshot_proposals(created_at desc);
create index if not exists idx_snapshot_proposals_end_at on snapshot_proposals(end_at desc);
create index if not exists idx_snapshot_proposals_author on snapshot_proposals(author);

create table if not exists proposal_enrichments (
  proposal_id text primary key,
  readable_content text,
  ai_summary text,
  importance_label text,
  risk_labels jsonb not null default '[]'::jsonb,
  facts jsonb not null default '[]'::jsonb,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists proposal_translations (
  proposal_id text not null,
  locale text not null,
  title text,
  body text,
  summary text,
  translated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (proposal_id, locale)
);

create index if not exists idx_proposal_translations_locale on proposal_translations(locale);
create index if not exists idx_proposal_translations_proposal_id on proposal_translations(proposal_id);

create table if not exists snapshot_sync_state (
  entity_type text primary key,
  last_success_at timestamptz,
  last_cursor text,
  last_created_ts bigint,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists snapshot_sync_runs (
  id bigserial primary key,
  entity_type text not null,
  status text not null,
  rows_upserted integer not null default 0,
  error text,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_snapshot_sync_runs_entity_type on snapshot_sync_runs(entity_type);
create index if not exists idx_snapshot_sync_runs_created_at on snapshot_sync_runs(created_at desc);
