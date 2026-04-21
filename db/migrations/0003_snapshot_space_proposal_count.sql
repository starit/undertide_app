alter table snapshot_spaces
add column if not exists proposal_count integer not null default 0;

update snapshot_spaces spaces
set proposal_count = counts.proposal_count
from (
  select space_id, count(*)::integer as proposal_count
  from snapshot_proposals
  group by space_id
) counts
where spaces.id = counts.space_id;

update snapshot_spaces
set proposal_count = 0
where proposal_count is null;
