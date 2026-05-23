/**
 * Incremental proposals sync — runs frequently (e.g. every 10 minutes via cron).
 *
 * Three stages per run:
 *   1. New proposals  — fetch proposals created after the watermark (created_gt)
 *   2. Active refresh — re-fetch all active proposals to keep votes/scores current
 *   3. Recent-closed  — re-fetch proposals that ended in the last 48 h to capture
 *                       finalized scores
 *
 * Prerequisites: run sync:snapshot:backfill at least once to establish the
 * watermark. Without a watermark this script falls back to the last 7 days and
 * logs a warning.
 *
 * Flags:
 *   --force              run even if no watermark exists (uses 7-day fallback window)
 *   --since <unix_ts>    override the stored watermark for this run only (does not
 *                        persist to DB); useful when the stored watermark is stale
 *                        or corrupted. Example: --since $(date -v-3d +%s)
 *   --reset-watermark <unix_ts>
 *                        permanently overwrite the stored watermark and exit without
 *                        syncing. Example: --reset-watermark $(date -v-3d +%s)
 *   --from-db            derive the watermark from MAX(created_ts) in the proposals
 *                        table instead of trusting the sync state. Useful after a
 *                        corrupted watermark: the DB itself tells you the last point
 *                        actually synced. Also persists the derived watermark so
 *                        future runs use it automatically.
 */
import "dotenv/config";
import { desc, max } from "drizzle-orm";
import { snapshotProposals } from "../db/drizzle-schema";
import {
  PROPOSAL_PAGE_SIZE,
  PROPOSAL_QUERY_FIELDS,
  createDb,
  fetchGraphQL,
  getSyncState,
  readNumberArg,
  refreshPlatformStatsAfterSync,
  refreshSpaceProposalCounts,
  runSync,
  safelyUpsertSyncState,
  upsertProposal,
  type SnapshotProposal,
} from "./sync-snapshot-shared";

const args = new Set(process.argv.slice(2));
const options = {
  force: args.has("--force"),
  fromDb: args.has("--from-db"),
  since: readNumberArg("--since"),
  resetWatermark: readNumberArg("--reset-watermark"),
};

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
const resolvedDatabaseUrl = databaseUrl;
const db = createDb(databaseUrl);

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

// Stage 1: proposals created after the watermark
async function syncNewProposals(lastCreatedTs: number): Promise<{
  upserted: number;
  highestCreatedTs: number;
  touchedSpaceIds: Set<string>;
}> {
  let upserted = 0;
  let page = 0;
  let highestCreatedTs = lastCreatedTs;
  const touchedSpaceIds = new Set<string>();
  let beforeCreated: number | null = null;

  while (true) {
    const where: Record<string, unknown> = { created_gt: lastCreatedTs };
    if (beforeCreated) where.created_lt = beforeCreated;

    const proposals = await fetchProposalPage(where);
    if (proposals.length === 0) break;

    page += 1;
    for (const proposal of proposals) {
      if (!proposal?.space?.id) continue;
      highestCreatedTs = Math.max(highestCreatedTs, Number(proposal.created ?? 0));
      await upsertProposal(db, proposal);
      touchedSpaceIds.add(proposal.space.id);
      upserted += 1;
    }

    const oldestInBatch = Math.min(...proposals.map((p) => Number(p.created ?? 0)));
    beforeCreated = Number.isFinite(oldestInBatch) && oldestInBatch > 0 ? oldestInBatch : null;

    console.log(
      `[proposals:new] page ${page}: ${proposals.length} proposals (cumulative ${upserted}),` +
      ` oldest created=${oldestInBatch ? new Date(oldestInBatch * 1000).toISOString() : "unknown"}`
    );
    if (proposals.length < PROPOSAL_PAGE_SIZE || !beforeCreated) break;
  }

  return { upserted, highestCreatedTs, touchedSpaceIds };
}

// Stage 2: re-fetch all active proposals (votes & scores change continuously)
async function syncActiveProposals(): Promise<{ upserted: number; touchedSpaceIds: Set<string> }> {
  let upserted = 0;
  let page = 0;
  const touchedSpaceIds = new Set<string>();
  let beforeCreated: number | null = null;

  console.log("[proposals:active] refreshing all currently-active proposals (no watermark)");

  while (true) {
    const where: Record<string, unknown> = { state: "active" };
    if (beforeCreated) where.created_lt = beforeCreated;

    const proposals = await fetchProposalPage(where);
    if (proposals.length === 0) break;

    page += 1;
    for (const proposal of proposals) {
      if (!proposal?.space?.id) continue;
      await upsertProposal(db, proposal);
      touchedSpaceIds.add(proposal.space.id);
      upserted += 1;
    }

    const oldestInBatch = Math.min(...proposals.map((p) => Number(p.created ?? 0)));
    beforeCreated = Number.isFinite(oldestInBatch) && oldestInBatch > 0 ? oldestInBatch : null;

    console.log(`[proposals:active] page ${page}: ${proposals.length} proposals refreshed (cumulative ${upserted})`);
    if (proposals.length < PROPOSAL_PAGE_SIZE || !beforeCreated) break;
  }

  return { upserted, touchedSpaceIds };
}

// Stage 3: re-fetch proposals that ended in the last 48 h to capture finalized scores
async function syncRecentlyClosedProposals(): Promise<{ upserted: number; touchedSpaceIds: Set<string> }> {
  const twoDaysAgo = Math.floor(Date.now() / 1000) - 48 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  let upserted = 0;
  let page = 0;
  const touchedSpaceIds = new Set<string>();
  let beforeCreated: number | null = null;

  console.log(`[proposals:recent-closed] refreshing proposals that ended in the last 48 h (since ${new Date(twoDaysAgo * 1000).toISOString()})`);

  while (true) {
    const where: Record<string, unknown> = { end_gt: twoDaysAgo, end_lt: now };
    if (beforeCreated) where.created_lt = beforeCreated;

    const proposals = await fetchProposalPage(where);
    if (proposals.length === 0) break;

    page += 1;
    for (const proposal of proposals) {
      if (!proposal?.space?.id) continue;
      await upsertProposal(db, proposal);
      touchedSpaceIds.add(proposal.space.id);
      upserted += 1;
    }

    const oldestInBatch = Math.min(...proposals.map((p) => Number(p.created ?? 0)));
    beforeCreated = Number.isFinite(oldestInBatch) && oldestInBatch > 0 ? oldestInBatch : null;

    console.log(`[proposals:recent-closed] page ${page}: ${proposals.length} proposals refreshed (cumulative ${upserted})`);
    if (proposals.length < PROPOSAL_PAGE_SIZE || !beforeCreated) break;
  }

  return { upserted, touchedSpaceIds };
}

const STALE_WARN_DAYS = 30;
const STALE_BLOCK_DAYS = 90;

async function deriveWatermarkFromDb(): Promise<number | null> {
  const [row] = await db
    .select({ maxTs: max(snapshotProposals.createdTs) })
    .from(snapshotProposals);
  const ts = row?.maxTs ? Number(row.maxTs) : null;
  if (ts) {
    console.log(`[proposals] --from-db: MAX(created_ts) in DB = ${ts} (${new Date(ts * 1000).toISOString()})`);
  } else {
    console.warn("[proposals] --from-db: snapshot_proposals table appears empty");
  }
  return ts;
}

async function syncProposals(): Promise<number> {
  const previousState = await getSyncState(db, "proposals");
  const storedCreatedTs = previousState?.lastCreatedTs ? Number(previousState.lastCreatedTs) : null;

  // --from-db: derive the watermark from actual DB content, not sync state
  if (options.fromDb) {
    const dbWatermark = await deriveWatermarkFromDb();
    if (!dbWatermark) {
      console.warn("[proposals] --from-db: no data found, falling back to 7-day window");
    }
    const effectiveWatermark = dbWatermark ?? Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    // Persist so future runs don't need --from-db
    await safelyUpsertSyncState(db, "proposals", { last_created_ts: effectiveWatermark, last_cursor: null });
    console.log(`[proposals] watermark updated to ${effectiveWatermark}. Starting incremental sync from here.`);
    const { upserted: newCount, highestCreatedTs, touchedSpaceIds: touched1 } = await syncNewProposals(effectiveWatermark);
    const { upserted: activeCount, touchedSpaceIds: touched2 } = await syncActiveProposals();
    const { upserted: closedCount, touchedSpaceIds: touched3 } = await syncRecentlyClosedProposals();
    const allTouched = new Set<string>();
    for (const id of touched1) allTouched.add(id);
    for (const id of touched2) allTouched.add(id);
    for (const id of touched3) allTouched.add(id);
    await refreshSpaceProposalCounts(db, Array.from(allTouched));
    const newWatermark = highestCreatedTs > effectiveWatermark ? highestCreatedTs : effectiveWatermark;
    await safelyUpsertSyncState(db, "proposals", { last_created_ts: newWatermark });
    return newCount + activeCount + closedCount;
  }

  if (storedCreatedTs === null && !options.force && !options.since) {
    console.warn(
      "[proposals] No watermark found — run pnpm sync:snapshot:backfill first, or pass --force to use a 7-day fallback window."
    );
    return 0;
  }

  // --since overrides the stored watermark for this run only
  const lastCreatedTs = options.since ?? storedCreatedTs;

  if (lastCreatedTs !== null) {
    const now = Math.floor(Date.now() / 1000);
    const agedays = (now - lastCreatedTs) / 86400;
    const watermarkDate = new Date(lastCreatedTs * 1000).toISOString();

    if (agedays > STALE_BLOCK_DAYS && !options.since) {
      console.error(
        `[proposals] Watermark is ${Math.round(agedays)} days old (${watermarkDate}) — this looks corrupted.`
      );
      console.error(
        "[proposals] Syncing from here would fetch years of data. Fix options:"
      );
      console.error(
        "  1. Reset to last N days:  pnpm sync:snapshot:proposals --since $(date -v-3d +%s)   # macOS"
      );
      console.error(
        "  2. Persist the reset:     pnpm sync:snapshot:proposals --reset-watermark $(date -v-3d +%s)"
      );
      console.error(
        "  3. Or update DB directly: UPDATE snapshot_sync_state SET last_created_ts = ... WHERE entity_type = 'proposals';"
      );
      return 0;
    }

    if (agedays > STALE_WARN_DAYS) {
      console.warn(
        `[proposals] Warning: watermark is ${Math.round(agedays)} days old (${watermarkDate}). ` +
        `This run will fetch all proposals since then. Use --since to limit scope if needed.`
      );
    }
  }

  // --force with no watermark: fall back to the last 7 days
  const effectiveWatermark = lastCreatedTs ?? Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  console.log(`[proposals] incremental sync from created_gt=${effectiveWatermark} (${new Date(effectiveWatermark * 1000).toISOString()})`);

  // Stage 1
  const { upserted: newCount, highestCreatedTs, touchedSpaceIds: touched1 } = await syncNewProposals(effectiveWatermark);
  console.log(`[proposals:new] done upserted=${newCount}`);

  // Stage 2
  const { upserted: activeCount, touchedSpaceIds: touched2 } = await syncActiveProposals();
  console.log(`[proposals:active] done upserted=${activeCount}`);

  // Stage 3
  const { upserted: closedCount, touchedSpaceIds: touched3 } = await syncRecentlyClosedProposals();
  console.log(`[proposals:recent-closed] done upserted=${closedCount}`);

  // Refresh proposal counts for all touched spaces
  const allTouched = new Set<string>();
  for (const id of touched1) allTouched.add(id);
  for (const id of touched2) allTouched.add(id);
  for (const id of touched3) allTouched.add(id);
  await refreshSpaceProposalCounts(db, Array.from(allTouched));

  // Advance watermark (never go backwards)
  const newWatermark = highestCreatedTs > (lastCreatedTs ?? 0) ? highestCreatedTs : (lastCreatedTs ?? highestCreatedTs);
  await safelyUpsertSyncState(db, "proposals", { last_created_ts: newWatermark });

  return newCount + activeCount + closedCount;
}

async function main() {
  // --reset-watermark: update the stored watermark and exit, no sync performed
  if (options.resetWatermark !== null) {
    const ts = options.resetWatermark!;
    await safelyUpsertSyncState(db, "proposals", { last_created_ts: ts, last_cursor: null });
    console.log(
      `[proposals] Watermark reset to ${ts} (${new Date(ts * 1000).toISOString()}). Run sync:snapshot:proposals to start syncing from here.`
    );
    return;
  }

  console.log("Starting proposals incremental sync...");
  await runSync(db, "proposals", syncProposals);
  await refreshPlatformStatsAfterSync(resolvedDatabaseUrl);
  console.log("Proposals incremental sync completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
