import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { count, eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  snapshotProposals,
  snapshotSpaceMembers,
  snapshotSpaces,
  snapshotSyncRuns,
  snapshotSyncState,
} from "../db/drizzle-schema";

const HUB_URL = "https://hub.snapshot.org/graphql";
const SPACE_PAGE_SIZE = 50;
const PROPOSAL_PAGE_SIZE = 100;
const REQUEST_RETRY_LIMIT = 4;
const REQUEST_RETRY_BASE_MS = 1500;
const DATABASE_RETRY_LIMIT = 4;
const DATABASE_RETRY_BASE_MS = 1000;

const args = new Set(process.argv.slice(2));
const options = {
  full: args.has("--full"),
  spacesOnly: args.has("--spaces-only"),
  proposalsOnly: args.has("--proposals-only"),
  spacesSkip: readNumberArg("--spaces-skip"),
};

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

const sql = neon(databaseUrl);

const db = drizzle(sql, {
  schema: {
    snapshotSpaces,
    snapshotSpaceMembers,
    snapshotProposals,
    snapshotSyncRuns,
    snapshotSyncState,
  },
});

async function main() {
  console.log("Starting Snapshot sync...");

  if (!options.proposalsOnly) {
    await runSync("spaces", syncSpaces);
  }

  if (!options.spacesOnly) {
    await runSync("proposals", syncProposals);
  }

  console.log("Snapshot sync completed.");
}

async function runSync(entityType: string, task: () => Promise<number>) {
  const runId = await startSyncRun(entityType);

  try {
    const rowsUpserted = await task();
    await safelyFinishSyncRun(runId, "success", rowsUpserted);
    await safelyUpsertSyncState(entityType, {
      last_success_at: new Date().toISOString(),
      last_error: null,
    });
    console.log(`[${entityType}] synced ${rowsUpserted} rows`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safelyFinishSyncRun(runId, "failed", 0, message);
    await safelyUpsertSyncState(entityType, {
      last_error: message,
    });
    throw error;
  }
}

const SPACE_LIST_SELECTION = `
            id
            name
            created
            proposalsCount
            followersCount
            verified
            categories
            votesCount
            twitter
            github
            coingecko
            website
            discussions
            flagged
            flagCode
            hibernated
            turbo
            activeProposals
            about
            avatar
            network
            symbol
            strategies {
              network
              params
            }
            admins
            members
            filters {
              minScore
              onlyMembers
            }
            plugins`;

async function fetchSpacePage(
  first: number,
  skip: number,
  where: Record<string, unknown>
): Promise<SnapshotSpace[]> {
  const batch = await fetchGraphQL<{ spaces: SnapshotSpace[] }>(
    `
        query GetSpaces($first: Int!, $skip: Int!, $where: SpaceWhere) {
          spaces(
            first: $first
            skip: $skip
            where: $where
            orderBy: "created"
            orderDirection: asc
          ) {
${SPACE_LIST_SELECTION}
          }
        }
      `,
    { first, skip, where }
  );
  return batch?.spaces ?? [];
}

async function runSpacesFullSync(startSkip: number): Promise<number> {
  let skip = startSkip;
  let upserted = 0;
  let memberSyncWarnings = 0;
  let maxSpaceCreated = 0;

  while (true) {
    const spaces = await fetchSpacePage(SPACE_PAGE_SIZE, skip, {});
    if (spaces.length === 0) break;

    for (const space of spaces) {
      maxSpaceCreated = Math.max(maxSpaceCreated, Number(space.created ?? 0));
      await upsertSpace(space);
      const membersSynced = await syncSpaceMembersSafely(space.id, space.members ?? []);
      if (!membersSynced) {
        memberSyncWarnings += 1;
      }
      upserted += 1;
    }

    skip += spaces.length;
    await safelyUpsertSyncState("spaces", {
      last_cursor: String(skip),
    });
    console.log(`[spaces] full scan offset ${skip}`);

    if (spaces.length < SPACE_PAGE_SIZE) break;
  }

  await safelyUpsertSyncState("spaces", {
    last_cursor: null,
    last_created_ts: maxSpaceCreated > 0 ? maxSpaceCreated : null,
  });

  if (memberSyncWarnings > 0) {
    console.warn(`[spaces] completed with ${memberSyncWarnings} member-sync warnings`);
  }

  return upserted;
}

async function runSpacesIncrementalSync(watermark: number): Promise<number> {
  let skip = 0;
  let upserted = 0;
  let memberSyncWarnings = 0;
  let maxSpaceCreated = watermark;

  while (true) {
    const spaces = await fetchSpacePage(SPACE_PAGE_SIZE, skip, { created_gt: watermark });
    if (spaces.length === 0) break;

    for (const space of spaces) {
      maxSpaceCreated = Math.max(maxSpaceCreated, Number(space.created ?? 0));
      await upsertSpace(space);
      const membersSynced = await syncSpaceMembersSafely(space.id, space.members ?? []);
      if (!membersSynced) {
        memberSyncWarnings += 1;
      }
      upserted += 1;
    }

    skip += spaces.length;
    console.log(`[spaces] incremental +${spaces.length} rows (page end offset ${skip})`);

    if (spaces.length < SPACE_PAGE_SIZE) break;
  }

  await safelyUpsertSyncState("spaces", {
    last_cursor: null,
    last_created_ts: maxSpaceCreated > 0 ? maxSpaceCreated : null,
  });

  if (memberSyncWarnings > 0) {
    console.warn(`[spaces] completed with ${memberSyncWarnings} member-sync warnings`);
  }

  return upserted;
}

async function syncSpaces() {
  if (options.full) {
    return runSpacesFullSync(0);
  }

  if (options.spacesSkip != null) {
    return runSpacesFullSync(options.spacesSkip);
  }

  const previousState = await getSyncState("spaces");
  const resumeSkip =
    previousState?.lastCursor != null && previousState.lastCursor !== ""
      ? parseCursorSkip(previousState.lastCursor)
      : 0;

  if (resumeSkip > 0) {
    console.log(`[spaces] resuming full scan from skip=${resumeSkip}`);
    return runSpacesFullSync(resumeSkip);
  }

  const createdWatermark =
    previousState?.lastCreatedTs != null && Number(previousState.lastCreatedTs) > 0
      ? Number(previousState.lastCreatedTs)
      : null;

  if (createdWatermark != null) {
    console.log(`[spaces] incremental sync (created_gt=${createdWatermark})`);
    return runSpacesIncrementalSync(createdWatermark);
  }

  return runSpacesFullSync(0);
}

async function syncProposals() {
  const previousState = options.full ? null : await getSyncState("proposals");
  const lastCreatedTs = previousState?.lastCreatedTs ? Number(previousState.lastCreatedTs) : null;

  let upserted = 0;
  let highestCreatedTs = lastCreatedTs ?? 0;
  let shouldStop = false;
  const touchedSpaceIds = new Set<string>();
  let beforeCreated = options.full ? null : parseOptionalCursor(previousState?.lastCursor);

  while (!shouldStop) {
    const batch = await fetchGraphQL<{ proposals: SnapshotProposal[] }>(
      `
        query GetProposals($first: Int!, $where: ProposalWhere) {
          proposals(
            first: $first
            where: $where
            orderBy: "created"
            orderDirection: desc
          ) {
            id
            ipfs
            type
            title
            body
            choices
            discussion
            flagged
            flagCode
            symbol
            labels
            quorum
            quorumType
            privacy
            link
            app
            start
            end
            snapshot
            state
            author
            created
            updated
            scores
            scores_by_strategy
            scores_total
            scores_state
            scores_total_value
            scores_updated
            votes
            plugins
            network
            strategies {
              network
              params
            }
            space {
              id
              name
            }
          }
        }
      `,
      {
        first: PROPOSAL_PAGE_SIZE,
        where: beforeCreated ? { created_lt: beforeCreated } : {},
      }
    );

    const proposals = batch?.proposals ?? [];
    if (proposals.length === 0) break;

    for (const proposal of proposals) {
      if (!proposal?.space?.id) continue;

      highestCreatedTs = Math.max(highestCreatedTs, Number(proposal.created ?? 0));
      await upsertProposal(proposal);
      touchedSpaceIds.add(proposal.space.id);
      upserted += 1;

      if (!options.full && lastCreatedTs && Number(proposal.created ?? 0) <= lastCreatedTs) {
        shouldStop = true;
      }
    }

    const oldestCreatedInBatch = Math.min(...proposals.map((proposal) => Number(proposal.created ?? 0)));
    beforeCreated = Number.isFinite(oldestCreatedInBatch) && oldestCreatedInBatch > 0 ? oldestCreatedInBatch : null;

    await safelyUpsertSyncState("proposals", {
      last_cursor: beforeCreated ? String(beforeCreated) : null,
    });

    console.log(
      `[proposals] fetched ${upserted} rows${beforeCreated ? `, next page before created=${beforeCreated}` : ""}`
    );

    if (proposals.length < PROPOSAL_PAGE_SIZE) break;
    if (!beforeCreated) break;
  }

  await refreshSpaceProposalCounts(Array.from(touchedSpaceIds));

  await safelyUpsertSyncState("proposals", {
    last_cursor: null,
    last_created_ts: highestCreatedTs || null,
  });

  return upserted;
}

async function fetchGraphQL<T>(query: string, variables: Record<string, unknown>) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= REQUEST_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await fetch(HUB_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`Snapshot API request failed: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors?.length) {
        throw new Error(`Snapshot API error: ${json.errors.map((entry) => entry.message).join("; ")}`);
      }

      if (attempt > 0) {
        console.log(`[snapshot] recovered after retry ${attempt}`);
      }

      return json.data;
    } catch (error) {
      lastError = error;
      if (attempt === REQUEST_RETRY_LIMIT) {
        break;
      }

      const waitMs = REQUEST_RETRY_BASE_MS * 2 ** attempt;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[snapshot] request failed (attempt ${attempt + 1}/${REQUEST_RETRY_LIMIT + 1}): ${message}`);
      console.warn(`[snapshot] retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function withDatabaseRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= DATABASE_RETRY_LIMIT; attempt += 1) {
    try {
      const result = await operation();

      if (attempt > 0) {
        console.log(`[db] recovered ${label} after retry ${attempt}`);
      }

      return result;
    } catch (error) {
      lastError = error;
      if (attempt === DATABASE_RETRY_LIMIT || !isRetryableDatabaseError(error)) {
        break;
      }

      const waitMs = DATABASE_RETRY_BASE_MS * 2 ** attempt;
      console.warn(`[db] ${label} failed (attempt ${attempt + 1}/${DATABASE_RETRY_LIMIT + 1}): ${stringifyError(error)}`);
      console.warn(`[db] retrying ${label} in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function upsertSpace(space: SnapshotSpace) {
  const sanitizedSpace = sanitizeValue(space);

  await withDatabaseRetry(`upsertSpace(${sanitizedSpace.id})`, async () => {
    await db
      .insert(snapshotSpaces)
      .values({
        id: sanitizedSpace.id,
        name: sanitizedSpace.name ?? sanitizedSpace.id,
        about: sanitizedSpace.about ?? null,
        avatar: sanitizedSpace.avatar ?? null,
        network: sanitizedSpace.network ?? null,
        symbol: sanitizedSpace.symbol ?? null,
        verified: Boolean(sanitizedSpace.verified),
        categories: sanitizedSpace.categories ?? [],
        followersCount: Number(sanitizedSpace.followersCount ?? 0),
        votesCount: Number(sanitizedSpace.votesCount ?? 0),
        twitter: sanitizedSpace.twitter ?? null,
        github: sanitizedSpace.github ?? null,
        coingecko: sanitizedSpace.coingecko ?? null,
        website: sanitizedSpace.website ?? null,
        discussions: sanitizedSpace.discussions ?? null,
        flagged: Boolean(sanitizedSpace.flagged),
        flagCode: Number(sanitizedSpace.flagCode ?? 0),
        hibernated: Boolean(sanitizedSpace.hibernated),
        turbo: Boolean(sanitizedSpace.turbo),
        activeProposals: Number(sanitizedSpace.activeProposals ?? 0),
        admins: sanitizedSpace.admins ?? [],
        memberCount: Array.isArray(sanitizedSpace.members) ? sanitizedSpace.members.length : 0,
        proposalCount: Number(sanitizedSpace.proposalsCount ?? 0),
        strategies: sanitizedSpace.strategies ?? [],
        filters: sanitizedSpace.filters ?? null,
        plugins: sanitizedSpace.plugins ?? null,
        raw: sanitizedSpace,
        updatedAt: drizzleSql`now()`,
      })
      .onConflictDoUpdate({
        target: snapshotSpaces.id,
        set: {
          name: sanitizedSpace.name ?? sanitizedSpace.id,
          about: sanitizedSpace.about ?? null,
          avatar: sanitizedSpace.avatar ?? null,
          network: sanitizedSpace.network ?? null,
          symbol: sanitizedSpace.symbol ?? null,
          verified: Boolean(sanitizedSpace.verified),
          categories: sanitizedSpace.categories ?? [],
          followersCount: Number(sanitizedSpace.followersCount ?? 0),
          votesCount: Number(sanitizedSpace.votesCount ?? 0),
          twitter: sanitizedSpace.twitter ?? null,
          github: sanitizedSpace.github ?? null,
          coingecko: sanitizedSpace.coingecko ?? null,
          website: sanitizedSpace.website ?? null,
          discussions: sanitizedSpace.discussions ?? null,
          flagged: Boolean(sanitizedSpace.flagged),
          flagCode: Number(sanitizedSpace.flagCode ?? 0),
          hibernated: Boolean(sanitizedSpace.hibernated),
          turbo: Boolean(sanitizedSpace.turbo),
          activeProposals: Number(sanitizedSpace.activeProposals ?? 0),
          admins: sanitizedSpace.admins ?? [],
          memberCount: Array.isArray(sanitizedSpace.members) ? sanitizedSpace.members.length : 0,
          proposalCount: Number(sanitizedSpace.proposalsCount ?? 0),
          strategies: sanitizedSpace.strategies ?? [],
          filters: sanitizedSpace.filters ?? null,
          plugins: sanitizedSpace.plugins ?? null,
          raw: sanitizedSpace,
          updatedAt: drizzleSql`now()`,
        },
      });
  });
}

async function refreshSpaceProposalCounts(spaceIds: string[]) {
  if (spaceIds.length === 0) return;

  const counts = await withDatabaseRetry("refreshSpaceProposalCounts.select", async () =>
    db
      .select({
        spaceId: snapshotProposals.spaceId,
        proposalCount: count(),
      })
      .from(snapshotProposals)
      .where(inArray(snapshotProposals.spaceId, spaceIds))
      .groupBy(snapshotProposals.spaceId)
  );

  const countsBySpaceId = new Map(counts.map((entry) => [entry.spaceId, entry.proposalCount]));

  for (const spaceId of spaceIds) {
    await withDatabaseRetry(`refreshSpaceProposalCounts.update(${spaceId})`, async () => {
      await db
        .update(snapshotSpaces)
        .set({
          proposalCount: countsBySpaceId.get(spaceId) ?? 0,
          updatedAt: drizzleSql`now()`,
        })
        .where(eq(snapshotSpaces.id, spaceId));
    });
  }
}

async function replaceSpaceMembers(spaceId: string, members: string[]) {
  const sanitizedMembers = sanitizeValue(members).filter((member): member is string => typeof member === "string" && member.length > 0);
  let performedFullReplace = false;

  try {
    await withDatabaseRetry(`replaceSpaceMembers.delete(${spaceId})`, async () => {
      await db.delete(snapshotSpaceMembers).where(eq(snapshotSpaceMembers.spaceId, spaceId));
    });
    performedFullReplace = true;
  } catch (error) {
    console.warn(
      `[spaces] failed to clear existing members for ${spaceId}; falling back to insert-only sync: ${stringifyError(error)}`
    );
  }

  if (sanitizedMembers.length === 0) {
    return performedFullReplace;
  }

  const chunkSize = 500;
  for (let index = 0; index < sanitizedMembers.length; index += chunkSize) {
    const chunk = sanitizedMembers.slice(index, index + chunkSize);
    await withDatabaseRetry(`replaceSpaceMembers.insert(${spaceId})#${index / chunkSize + 1}`, async () => {
      await db
        .insert(snapshotSpaceMembers)
        .values(
          chunk.map((member) => ({
            spaceId,
            memberAddress: member,
          }))
        )
        .onConflictDoUpdate({
          target: [snapshotSpaceMembers.spaceId, snapshotSpaceMembers.memberAddress],
          set: {
            updatedAt: drizzleSql`now()`,
          },
        });
    });
  }

  return performedFullReplace;
}

async function syncSpaceMembersSafely(spaceId: string, members: string[]) {
  try {
    return await replaceSpaceMembers(spaceId, members);
  } catch (error) {
    console.warn(`[spaces] member sync failed for ${spaceId}: ${stringifyError(error)}`);
    return false;
  }
}

async function upsertProposal(proposal: SnapshotProposal) {
  const sanitizedProposal = sanitizeValue(proposal);
  const scoresTotal = normalizeNumericValue(sanitizedProposal.scores_total);
  const scoresTotalValue = normalizeNumericValue(sanitizedProposal.scores_total_value);

  const proposalValues = {
    spaceId: sanitizedProposal.space.id,
    ipfs: sanitizedProposal.ipfs ?? null,
    type: sanitizedProposal.type ?? null,
    title: sanitizedProposal.title ?? sanitizedProposal.id,
    body: sanitizedProposal.body ?? null,
    choices: sanitizedProposal.choices ?? [],
    discussion: sanitizedProposal.discussion || null,
    flagged: sanitizedProposal.flagged ?? false,
    flagCode: sanitizedProposal.flagCode ?? 0,
    symbol: sanitizedProposal.symbol ?? null,
    labels: sanitizedProposal.labels ?? [],
    quorum: sanitizedProposal.quorum != null ? String(sanitizedProposal.quorum) : null,
    quorumType: sanitizedProposal.quorumType ?? null,
    privacy: sanitizedProposal.privacy ?? null,
    link: sanitizedProposal.link ?? null,
    app: sanitizedProposal.app ?? null,
    startTs: Number(sanitizedProposal.start ?? 0),
    endTs: Number(sanitizedProposal.end ?? 0),
    createdTs: Number(sanitizedProposal.created ?? 0),
    updatedTs: sanitizedProposal.updated ? Number(sanitizedProposal.updated) : null,
    snapshotBlock: sanitizedProposal.snapshot ?? null,
    state: sanitizedProposal.state ?? "unknown",
    author: sanitizedProposal.author ?? "",
    network: sanitizedProposal.network ?? null,
    scores: sanitizedProposal.scores ?? null,
    scoresByStrategy: sanitizedProposal.scores_by_strategy ?? null,
    scoresTotal,
    scoresState: sanitizedProposal.scores_state ?? null,
    scoresTotalValue,
    scoresUpdatedTs: sanitizedProposal.scores_updated ? Number(sanitizedProposal.scores_updated) : null,
    votesCount: Number(sanitizedProposal.votes ?? 0),
    strategies: sanitizedProposal.strategies ?? [],
    plugins: sanitizedProposal.plugins ?? null,
    raw: sanitizedProposal,
    syncedAt: drizzleSql`now()`,
  };

  await withDatabaseRetry(`upsertProposal(${sanitizedProposal.id})`, async () => {
    await db
      .insert(snapshotProposals)
      .values({ id: sanitizedProposal.id, ...proposalValues })
      .onConflictDoUpdate({
        target: snapshotProposals.id,
        set: proposalValues,
      });
  });
}

async function startSyncRun(entityType: string) {
  const rows = await withDatabaseRetry(`startSyncRun(${entityType})`, async () =>
    db
      .insert(snapshotSyncRuns)
      .values({
        entityType,
        status: "running",
        rowsUpserted: 0,
      })
      .returning({ id: snapshotSyncRuns.id })
  );

  return rows[0]?.id;
}

async function finishSyncRun(id: number | undefined, status: string, rowsUpserted: number, error: string | null = null) {
  if (!id) return;

  await withDatabaseRetry(`finishSyncRun(${id})`, async () => {
    await db
      .update(snapshotSyncRuns)
      .set({
        finishedAt: drizzleSql`now()`,
        updatedAt: drizzleSql`now()`,
        status,
        rowsUpserted,
        error,
      })
      .where(eq(snapshotSyncRuns.id, id));
  });
}

async function getSyncState(entityType: string) {
  const rows = await withDatabaseRetry(`getSyncState(${entityType})`, async () =>
    db
      .select()
      .from(snapshotSyncState)
      .where(eq(snapshotSyncState.entityType, entityType))
      .limit(1)
  );

  return rows[0] ?? null;
}

async function upsertSyncState(
  entityType: string,
  patch: {
    last_success_at?: string | null;
    last_cursor?: string | null;
    last_created_ts?: number | null;
    last_error?: string | null;
  }
) {
  const previous = (await getSyncState(entityType)) ?? {};
  const lastSuccessAt = normalizeDateValue(
    "last_success_at" in patch ? patch.last_success_at : (previous.lastSuccessAt ?? null)
  );
  const lastCursor = "last_cursor" in patch ? patch.last_cursor : (previous.lastCursor ?? null);
  const lastCreatedTs =
    "last_created_ts" in patch ? patch.last_created_ts : (previous.lastCreatedTs ?? null);
  const lastError = "last_error" in patch ? patch.last_error : (previous.lastError ?? null);

  await withDatabaseRetry(`upsertSyncState(${entityType})`, async () => {
    await db
      .insert(snapshotSyncState)
      .values({
        entityType,
        lastSuccessAt,
        lastCursor,
        lastCreatedTs,
        lastError,
        updatedAt: drizzleSql`now()`,
      })
      .onConflictDoUpdate({
        target: snapshotSyncState.entityType,
        set: {
          lastSuccessAt,
          lastCursor,
          lastCreatedTs,
          lastError,
          updatedAt: drizzleSql`now()`,
        },
      });
  });
}

async function safelyFinishSyncRun(id: number | undefined, status: string, rowsUpserted: number, error: string | null = null) {
  try {
    await finishSyncRun(id, status, rowsUpserted, error);
  } catch (finishError) {
    console.warn(`[sync-run] failed to persist run status for ${id ?? "unknown"}: ${stringifyError(finishError)}`);
  }
}

async function safelyUpsertSyncState(
  entityType: string,
  patch: {
    last_success_at?: string | null;
    last_cursor?: string | null;
    last_created_ts?: number | null;
    last_error?: string | null;
  }
) {
  try {
    await upsertSyncState(entityType, patch);
  } catch (stateError) {
    console.warn(`[sync-state] failed to persist ${entityType} state: ${stringifyError(stateError)}`);
  }
}

function isRetryableDatabaseError(error: unknown) {
  const message = stringifyError(error).toLowerCase();
  return /fetch failed|error connecting to database|connection|timeout|temporar|network|econn|etimedout|socket/.test(message);
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

type SnapshotStrategy = {
  name?: string;
  network?: string;
  params?: unknown;
};

type SnapshotSpace = {
  id: string;
  name?: string;
  created?: number;
  proposalsCount?: number | null;
  followersCount?: number | null;
  verified?: boolean | null;
  categories?: string[] | null;
  votesCount?: number | null;
  twitter?: string | null;
  github?: string | null;
  coingecko?: string | null;
  website?: string | null;
  discussions?: string | null;
  flagged?: boolean | null;
  flagCode?: number | null;
  hibernated?: boolean | null;
  turbo?: boolean | null;
  activeProposals?: number | null;
  about?: string | null;
  avatar?: string | null;
  network?: string | null;
  symbol?: string | null;
  strategies?: SnapshotStrategy[];
  admins?: string[];
  members?: string[];
  filters?: Record<string, unknown> | null;
  plugins?: Record<string, unknown> | null;
};

type SnapshotProposal = {
  id: string;
  ipfs?: string | null;
  type?: string | null;
  title?: string;
  body?: string | null;
  choices?: string[];
  discussion?: string | null;
  flagged?: boolean | null;
  flagCode?: number | null;
  symbol?: string | null;
  labels?: string[] | null;
  quorum?: number | null;
  quorumType?: string | null;
  privacy?: string | null;
  link?: string | null;
  app?: string | null;
  start?: number;
  end?: number;
  snapshot?: string | null;
  state?: string;
  author?: string;
  created?: number;
  updated?: number | null;
  scores?: number[] | null;
  scores_by_strategy?: number[][] | null;
  scores_total?: string | number | null;
  scores_state?: string | null;
  scores_total_value?: string | number | null;
  scores_updated?: number | null;
  votes?: number | null;
  plugins?: Record<string, unknown> | null;
  network?: string | null;
  strategies?: SnapshotStrategy[];
  space: {
    id: string;
    name?: string;
  };
};

function sanitizeValue<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\u0000/g, "") as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)])
    ) as T;
  }

  return value;
}

function normalizeNumericValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function normalizeDateValue(value: string | Date | null | undefined) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

function parseCursorSkip(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseOptionalCursor(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readNumberArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;

  const raw = process.argv[index + 1];
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
