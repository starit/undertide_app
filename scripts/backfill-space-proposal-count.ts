import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { count, inArray, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { snapshotProposals, snapshotSpaces } from "../db/drizzle-schema";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

const sql = neon(databaseUrl);
const db = drizzle(sql, {
  schema: {
    snapshotProposals,
    snapshotSpaces,
  },
});

async function main() {
  console.log("[backfill] recomputing snapshot_spaces.proposal_count");

  const counts = await db
    .select({
      spaceId: snapshotProposals.spaceId,
      proposalCount: count(),
    })
    .from(snapshotProposals)
    .groupBy(snapshotProposals.spaceId);

  console.log(`[backfill] found ${counts.length} spaces with proposals`);

  const chunkSize = 500;
  let updated = 0;

  for (let index = 0; index < counts.length; index += chunkSize) {
    const chunk = counts.slice(index, index + chunkSize);

    const cases = drizzleSql.join(
      chunk.map((entry) => drizzleSql`when ${snapshotSpaces.id} = ${entry.spaceId} then ${entry.proposalCount}`),
      drizzleSql.raw(" ")
    );

    await db
      .update(snapshotSpaces)
      .set({
        proposalCount: drizzleSql`case ${cases} else ${snapshotSpaces.proposalCount} end`,
        updatedAt: drizzleSql`now()`,
      })
      .where(inArray(snapshotSpaces.id, chunk.map((entry) => entry.spaceId)));

    updated += chunk.length;
    console.log(`[backfill] updated ${updated}/${counts.length}`);
  }

  console.log("[backfill] snapshot_spaces.proposal_count backfill completed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
