import "dotenv/config";
import { count, sql as drizzleSql } from "drizzle-orm";
import { snapshotSpaces } from "../db/drizzle-schema";
import {
  SPACE_LIST_SELECTION,
  SPACE_PAGE_SIZE,
  createDb,
  fetchGraphQL,
  readArgValues,
  refreshPlatformStatsAfterSync,
  runSync,
  stringifyError,
  syncSpaceMembersSafely,
  upsertSpace,
  type SnapshotSpace,
} from "./sync-snapshot-shared";

const args = new Set(process.argv.slice(2));
const options = {
  full: args.has("--full"),
  spaceIds: readArgValues("--space-id"),
};

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
const resolvedDatabaseUrl = databaseUrl;
const db = createDb(databaseUrl);

async function fetchSpacePage(first: number, skip: number, where: Record<string, unknown>): Promise<SnapshotSpace[]> {
  const batch = await fetchGraphQL<{ spaces: SnapshotSpace[] }>(
    `query GetSpaces($first: Int!, $skip: Int!, $where: SpaceWhere) {
      spaces(first: $first, skip: $skip, where: $where, orderBy: "created", orderDirection: asc) {
        ${SPACE_LIST_SELECTION}
      }
    }`,
    { first, skip, where }
  );
  return batch?.spaces ?? [];
}

async function runFullSync(): Promise<number> {
  let skip = 0;
  let upserted = 0;
  let memberSyncWarnings = 0;

  while (true) {
    const spaces = await fetchSpacePage(SPACE_PAGE_SIZE, skip, {});
    if (spaces.length === 0) break;

    for (const space of spaces) {
      await upsertSpace(db, space);
      const membersSynced = await syncSpaceMembersSafely(db, space.id, space.members ?? []);
      if (!membersSynced) memberSyncWarnings += 1;
      upserted += 1;
    }

    skip += spaces.length;
    console.log(`[spaces] full scan offset ${skip}`);
    if (spaces.length < SPACE_PAGE_SIZE) break;
  }

  if (memberSyncWarnings > 0) console.warn(`[spaces] completed with ${memberSyncWarnings} member-sync warnings`);
  return upserted;
}

async function runIncrementalSync(watermark: number): Promise<number> {
  let skip = 0;
  let upserted = 0;
  let memberSyncWarnings = 0;

  while (true) {
    const spaces = await fetchSpacePage(SPACE_PAGE_SIZE, skip, { created_gt: watermark });
    if (spaces.length === 0) break;

    for (const space of spaces) {
      await upsertSpace(db, space);
      const membersSynced = await syncSpaceMembersSafely(db, space.id, space.members ?? []);
      if (!membersSynced) memberSyncWarnings += 1;
      upserted += 1;
    }

    skip += spaces.length;
    console.log(`[spaces] incremental +${spaces.length} rows (page end offset ${skip})`);
    if (spaces.length < SPACE_PAGE_SIZE) break;
  }

  if (memberSyncWarnings > 0) console.warn(`[spaces] completed with ${memberSyncWarnings} member-sync warnings`);
  return upserted;
}

async function deriveWatermark(): Promise<number | null> {
  const [row] = await db
    .select({ maxCreated: drizzleSql<number>`MAX((${snapshotSpaces.raw}->>'created')::bigint)` })
    .from(snapshotSpaces);
  const ts = row?.maxCreated ? Number(row.maxCreated) : null;
  if (ts) {
    console.log(`[spaces] watermark from DB: ${ts} (${new Date(ts * 1000).toISOString()})`);
  }
  return ts;
}

// Targeted sync: fetch and upsert specific spaces by ID
async function syncTargetedSpaces(spaceIds: string[]): Promise<number> {
  let upserted = 0;
  for (const spaceId of spaceIds) {
    const batch = await fetchGraphQL<{ spaces: SnapshotSpace[] }>(
      `query GetSpace($where: SpaceWhere) {
        spaces(first: 1, where: $where) { ${SPACE_LIST_SELECTION} }
      }`,
      { where: { id: spaceId } }
    );
    const space = batch?.spaces?.[0];
    if (!space) {
      console.warn(`[spaces] space not found on Snapshot: ${spaceId}`);
      continue;
    }
    try {
      await upsertSpace(db, space);
      await syncSpaceMembersSafely(db, space.id, space.members ?? []);
      console.log(`[spaces] targeted upsert done: ${spaceId}`);
      upserted += 1;
    } catch (error) {
      console.error(`[spaces] targeted upsert failed for ${spaceId}: ${stringifyError(error)}`);
    }
  }
  return upserted;
}

async function syncSpaces(): Promise<number> {
  if (options.spaceIds.length > 0) return syncTargetedSpaces(options.spaceIds);
  if (options.full) {
    console.log("[spaces] --full: starting full scan");
    return runFullSync();
  }

  const watermark = await deriveWatermark();
  if (!watermark) {
    console.log("[spaces] table empty, starting full scan");
    return runFullSync();
  }

  console.log(`[spaces] incremental sync (created_gt=${watermark})`);
  return runIncrementalSync(watermark);
}

async function getDbSpaceCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(snapshotSpaces);
  return Number(row?.n ?? 0);
}

async function main() {
  console.log("Starting spaces sync...");
  const dbBefore = await getDbSpaceCount();
  console.log(`[spaces] DB count before: ${dbBefore}`);
  await runSync(db, "spaces", syncSpaces);
  const dbAfter = await getDbSpaceCount();
  console.log(`[spaces] DB count after: ${dbAfter} (${dbAfter >= dbBefore ? "+" : ""}${dbAfter - dbBefore})`);
  await refreshPlatformStatsAfterSync(resolvedDatabaseUrl);
  console.log("Spaces sync completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
