/**
 * Full historical backfill — run once (or on-demand) to populate the DB from
 * newest to oldest.  Can be safely interrupted and resumed: progress is tracked
 * under the "proposals-backfill" sync-state entity, completely separate from the
 * incremental sync state so the two never interfere.
 *
 * When the backfill finishes fully it seeds the incremental watermark
 * (proposals.last_created_ts) if one doesn't exist yet, so you can immediately
 * start the incremental sync afterwards.
 *
 * Flags:
 *   --stop-at <unix_ts>   stop once the oldest proposal in a batch is older than
 *                         this timestamp (useful for partial / date-bounded fills)
 *   --proposal-id <id>    fetch and upsert exactly one proposal (repeatable)
 */
import "dotenv/config";
import {
  PROPOSAL_PAGE_SIZE,
  PROPOSAL_QUERY_FIELDS,
  createDb,
  fetchGraphQL,
  getSyncState,
  parseOptionalCursor,
  readArgValues,
  readNumberArg,
  refreshSpaceProposalCounts,
  runSync,
  safelyUpsertSyncState,
  stringifyError,
  upsertProposalsBatch,
  type SnapshotProposal,
} from "./sync-snapshot-shared";

const options = {
  stopAt: readNumberArg("--stop-at"),
  proposalIds: readArgValues("--proposal-id"),
};

const _databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!_databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
const databaseUrl: string = _databaseUrl;
const db = createDb(databaseUrl);

// Separate entity so backfill cursor never pollutes the incremental state
const BACKFILL_ENTITY = "proposals-backfill";

async function fetchProposalPage(where: Record<string, unknown>): Promise<SnapshotProposal[]> {
  const batch = await fetchGraphQL<{ proposals: SnapshotProposal[] }>(
    `query GetProposals($first: Int!, $where: ProposalWhere) {
      proposals(first: $first, where: $where, orderBy: "created", orderDirection: desc) {
        ${PROPOSAL_QUERY_FIELDS}
      }
    }`,
    { first: PROPOSAL_PAGE_SIZE, where }
  );
  return batch?.proposals ?? [];
}

async function runBackfill(): Promise<number> {
  const previousState = await getSyncState(db, BACKFILL_ENTITY);
  // Resume from where we left off; only valid within a backfill run
  let beforeCreated = parseOptionalCursor(previousState?.lastCursor);

  let upserted = 0;
  let highestCreatedTs = 0; // tracks the newest proposal seen (first batch)
  const touchedSpaceIds = new Set<string>();
  const batch: SnapshotProposal[] = [];

  if (beforeCreated) {
    console.log(`[backfill] resuming from cursor created_lt=${beforeCreated}`);
  } else {
    console.log(`[backfill] starting full scan from newest`);
  }

  while (true) {
    const where: Record<string, unknown> = {};
    if (beforeCreated) where.created_lt = beforeCreated;

    const proposals = await fetchProposalPage(where);
    if (proposals.length === 0) break;

    for (const proposal of proposals) {
      if (!proposal?.space?.id) continue;
      const createdTs = Number(proposal.created ?? 0);
      if (createdTs > highestCreatedTs) highestCreatedTs = createdTs;
      batch.push(proposal);
      touchedSpaceIds.add(proposal.space.id);
    }

    const oldestInBatch = Math.min(...proposals.map((p) => Number(p.created ?? 0)));
    beforeCreated = Number.isFinite(oldestInBatch) && oldestInBatch > 0 ? oldestInBatch : null;

    const flushed = await upsertProposalsBatch(databaseUrl, batch);
    batch.length = 0;
    upserted += flushed;

    // Persist cursor so we can resume if interrupted
    await safelyUpsertSyncState(db, BACKFILL_ENTITY, {
      last_cursor: beforeCreated ? String(beforeCreated) : null,
    });

    console.log(`[backfill] ${upserted} rows total (flushed ${flushed}), oldest in batch created=${oldestInBatch}`);

    if (proposals.length < PROPOSAL_PAGE_SIZE || !beforeCreated) break;

    if (options.stopAt && oldestInBatch < options.stopAt) {
      console.log(`[backfill] reached --stop-at=${options.stopAt}, stopping early`);
      break;
    }
  }

  if (batch.length > 0) {
    upserted += await upsertProposalsBatch(databaseUrl, batch);
    batch.length = 0;
  }

  // Refresh proposal counts for all touched spaces
  await refreshSpaceProposalCounts(db, Array.from(touchedSpaceIds));

  // When the backfill has fully completed (no cursor left), seed the incremental
  // watermark with the newest timestamp we observed so the incremental sync can
  // pick up exactly where history ends.
  if (!beforeCreated && highestCreatedTs > 0) {
    const proposalsState = await getSyncState(db, "proposals");
    if (!proposalsState?.lastCreatedTs) {
      await safelyUpsertSyncState(db, "proposals", { last_created_ts: highestCreatedTs });
      console.log(`[backfill] seeded proposals watermark to ${highestCreatedTs} — you can now run sync:snapshot:proposals`);
    }
  }

  return upserted;
}

// Targeted sync: fetch and upsert specific proposals by ID
async function syncTargetedProposals(proposalIds: string[]): Promise<number> {
  let upserted = 0;
  const touchedSpaceIds = new Set<string>();
  const pending: SnapshotProposal[] = [];

  for (const proposalId of proposalIds) {
    const result = await fetchGraphQL<{ proposals: SnapshotProposal[] }>(
      `query GetProposal($where: ProposalWhere) {
        proposals(first: 1, where: $where) { ${PROPOSAL_QUERY_FIELDS} }
      }`,
      { where: { id: proposalId } }
    );
    const proposal = result?.proposals?.[0];
    if (!proposal) {
      console.warn(`[backfill] proposal not found on Snapshot: ${proposalId}`);
      continue;
    }
    try {
      pending.push(proposal);
      if (pending.length >= 100) {
        upserted += await upsertProposalsBatch(databaseUrl, pending);
        pending.length = 0;
      }
      if (proposal.space?.id) touchedSpaceIds.add(proposal.space.id);
      console.log(`[backfill] targeted upsert queued: ${proposalId}`);
    } catch (error) {
      console.error(`[backfill] targeted upsert failed for ${proposalId}: ${stringifyError(error)}`);
    }
  }

  // Flush remaining
  if (pending.length > 0) {
    upserted += await upsertProposalsBatch(databaseUrl, pending);
    pending.length = 0;
  }

  await refreshSpaceProposalCounts(db, Array.from(touchedSpaceIds));
  return upserted;
}

async function main() {
  if (options.proposalIds.length > 0) {
    console.log(`Starting targeted proposal sync for: ${options.proposalIds.join(", ")}`);
    await runSync(db, BACKFILL_ENTITY, () => syncTargetedProposals(options.proposalIds));
    console.log("Targeted proposal sync completed.");
    return;
  }

  console.log("Starting proposals backfill...");
  await runSync(db, BACKFILL_ENTITY, runBackfill);
  console.log("Backfill completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
