create table if not exists proposal_translations (
  proposal_id text not null references snapshot_proposals(id) on delete cascade,
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
