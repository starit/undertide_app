import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { snapshotSpaces } from "../db/drizzle-schema";

const HUB_URL = "https://hub.snapshot.org/graphql";
const FETCH_BATCH = 100; // Snapshot API id_in limit is 100

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");

const neonSql = neon(databaseUrl);
const db = drizzle(neonSql, { schema: { snapshotSpaces } });

async function main() {
  const spaces = await db
    .select({ id: snapshotSpaces.id })
    .from(snapshotSpaces)
    .where(isNull(snapshotSpaces.avatar));

  console.log(`[backfill-avatar] ${spaces.length} spaces without avatar`);
  if (spaces.length === 0) return;

  const ids = spaces.map((s) => s.id);
  let updated = 0;

  for (let i = 0; i < ids.length; i += FETCH_BATCH) {
    const batch = ids.slice(i, i + FETCH_BATCH);
    const avatars = await fetchAvatars(batch);

    for (const [id, avatar] of Object.entries(avatars)) {
      if (!avatar) continue;
      await db
        .update(snapshotSpaces)
        .set({ avatar })
        .where(and(eq(snapshotSpaces.id, id), isNull(snapshotSpaces.avatar)));
      updated += 1;
    }

    console.log(`[backfill-avatar] processed ${Math.min(i + FETCH_BATCH, ids.length)}/${ids.length}, updated ${updated} so far`);
  }

  console.log(`[backfill-avatar] done — updated ${updated} spaces`);
}

async function fetchAvatars(ids: string[]): Promise<Record<string, string | null>> {
  const response = await fetch(HUB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query GetSpaceAvatars($ids: [String!]!) {
          spaces(where: { id_in: $ids }, first: ${FETCH_BATCH}) {
            id
            avatar
          }
        }
      `,
      variables: { ids },
    }),
  });

  if (!response.ok) throw new Error(`Snapshot API error: ${response.status}`);

  const json = (await response.json()) as {
    errors?: Array<{ message: string }>;
    data?: { spaces?: Array<{ id: string; avatar?: string | null }> };
  };

  if (json.errors?.length) throw new Error(`Snapshot API error: ${json.errors[0].message}`);

  const result: Record<string, string | null> = {};
  for (const space of json.data?.spaces ?? []) {
    result[space.id] = space.avatar || null;
  }
  return result;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
