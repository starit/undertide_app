import { neon } from "@neondatabase/serverless";
import { eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  snapshotProposals,
  snapshotSpaceMembers,
  snapshotSpaces,
  snapshotSyncRuns,
  snapshotSyncState,
} from "../db/drizzle-schema";
import { refreshPlatformStats } from "../lib/platform-stats-refresh";

// ─── Constants ────────────────────────────────────────────────────────────────

export const HUB_URL = "https://hub.snapshot.org/graphql";
export const SPACE_PAGE_SIZE = 50;
export const PROPOSAL_PAGE_SIZE = 100;
export const REQUEST_RETRY_LIMIT = 4;
export const REQUEST_RETRY_BASE_MS = 1500;
export const DATABASE_RETRY_LIMIT = 4;
export const DATABASE_RETRY_BASE_MS = 1000;

export const SPACE_LIST_SELECTION = `
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
  strategies { network params }
  admins
  members
  filters { minScore onlyMembers }
  plugins`;

export const PROPOSAL_QUERY_FIELDS = `
  id ipfs type title body choices discussion flagged flagCode symbol labels
  quorum quorumType privacy link app start end snapshot state author created
  updated scores scores_by_strategy scores_total scores_state scores_total_value
  scores_updated votes plugins network
  strategies { network params }
  space { id name }`;

// ─── DB setup ─────────────────────────────────────────────────────────────────

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, {
    schema: { snapshotSpaces, snapshotSpaceMembers, snapshotProposals, snapshotSyncRuns, snapshotSyncState },
  });
}

export type SyncDb = ReturnType<typeof createDb>;

// ─── Types ────────────────────────────────────────────────────────────────────

export type SnapshotStrategy = { name?: string; network?: string; params?: unknown };

export type SnapshotSpace = {
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

export type SnapshotProposal = {
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
  space: { id: string; name?: string };
};

// ─── GraphQL ──────────────────────────────────────────────────────────────────

export async function fetchGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T | undefined> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= REQUEST_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await fetch(HUB_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`Snapshot API request failed: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors?.length) {
        throw new Error(`Snapshot API error: ${json.errors.map((e) => e.message).join("; ")}`);
      }

      if (attempt > 0) console.log(`[snapshot] recovered after retry ${attempt}`);
      return json.data;
    } catch (error) {
      lastError = error;
      if (attempt === REQUEST_RETRY_LIMIT) break;
      const waitMs = REQUEST_RETRY_BASE_MS * 2 ** attempt;
      console.warn(`[snapshot] request failed (attempt ${attempt + 1}/${REQUEST_RETRY_LIMIT + 1}): ${stringifyError(error)}`);
      console.warn(`[snapshot] retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ─── DB retry ─────────────────────────────────────────────────────────────────

export async function withDatabaseRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= DATABASE_RETRY_LIMIT; attempt += 1) {
    try {
      const result = await operation();
      if (attempt > 0) console.log(`[db] recovered ${label} after retry ${attempt}`);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === DATABASE_RETRY_LIMIT || !isRetryableDatabaseError(error)) break;
      const waitMs = DATABASE_RETRY_BASE_MS * 2 ** attempt;
      console.warn(`[db] ${label} failed (attempt ${attempt + 1}/${DATABASE_RETRY_LIMIT + 1}): ${stringifyError(error)}`);
      console.warn(`[db] retrying ${label} in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ─── Upsert operations ────────────────────────────────────────────────────────

export async function upsertSpace(db: SyncDb, space: SnapshotSpace): Promise<void> {
  const s = sanitizeValue(space);
  const values = {
    name: s.name ?? s.id,
    about: s.about ?? null,
    avatar: s.avatar ?? null,
    network: s.network ?? null,
    symbol: s.symbol ?? null,
    verified: Boolean(s.verified),
    categories: s.categories ?? [],
    followersCount: Number(s.followersCount ?? 0),
    votesCount: Number(s.votesCount ?? 0),
    twitter: s.twitter ?? null,
    github: s.github ?? null,
    coingecko: s.coingecko ?? null,
    website: s.website ?? null,
    discussions: s.discussions ?? null,
    flagged: Boolean(s.flagged),
    flagCode: Number(s.flagCode ?? 0),
    hibernated: Boolean(s.hibernated),
    turbo: Boolean(s.turbo),
    activeProposals: Number(s.activeProposals ?? 0),
    admins: s.admins ?? [],
    memberCount: Array.isArray(s.members) ? s.members.length : 0,
    proposalCount: Number(s.proposalsCount ?? 0),
    strategies: s.strategies ?? [],
    filters: s.filters ?? null,
    plugins: s.plugins ?? null,
    raw: s,
    updatedAt: drizzleSql`now()`,
  };

  await withDatabaseRetry(`upsertSpace(${s.id})`, () =>
    db.insert(snapshotSpaces).values({ id: s.id, ...values }).onConflictDoUpdate({ target: snapshotSpaces.id, set: values })
  );
}

export async function upsertProposal(db: SyncDb, proposal: SnapshotProposal): Promise<void> {
  const p = sanitizeValue(proposal);
  const values = {
    spaceId: p.space.id,
    ipfs: p.ipfs ?? null,
    type: p.type ?? null,
    title: p.title ?? p.id,
    body: p.body ?? null,
    choices: p.choices ?? [],
    discussion: p.discussion || null,
    flagged: p.flagged ?? false,
    flagCode: p.flagCode ?? 0,
    symbol: p.symbol ?? null,
    labels: p.labels ?? [],
    quorum: p.quorum != null ? String(p.quorum) : null,
    quorumType: p.quorumType ?? null,
    privacy: p.privacy ?? null,
    link: p.link ?? null,
    app: p.app ?? null,
    startTs: Number(p.start ?? 0),
    endTs: Number(p.end ?? 0),
    createdTs: Number(p.created ?? 0),
    updatedTs: p.updated ? Number(p.updated) : null,
    snapshotBlock: p.snapshot ?? null,
    state: p.state ?? "unknown",
    author: p.author ?? "",
    network: p.network ?? null,
    scores: p.scores ?? null,
    scoresByStrategy: p.scores_by_strategy ?? null,
    scoresTotal: normalizeNumericValue(p.scores_total),
    scoresState: p.scores_state ?? null,
    scoresTotalValue: normalizeNumericValue(p.scores_total_value),
    scoresUpdatedTs: p.scores_updated ? Number(p.scores_updated) : null,
    votesCount: Number(p.votes ?? 0),
    strategies: p.strategies ?? [],
    plugins: p.plugins ?? null,
    raw: p,
    syncedAt: drizzleSql`now()`,
  };

  await withDatabaseRetry(`upsertProposal(${p.id})`, () =>
    db.insert(snapshotProposals).values({ id: p.id, ...values }).onConflictDoUpdate({ target: snapshotProposals.id, set: values })
  );
}

const BATCH_FLUSH_SIZE = 100;

/**
 * Convert a SnapshotProposal to the params needed for the batch upsert SQL.
 * Returns a flat array of values in column order.
 */
function proposalToRow(p: SnapshotProposal): unknown[] {
  const s = sanitizeValue(p);
  return [
    s.id,
    s.space.id,
    s.title ?? s.id,
    s.body ?? null,
    JSON.stringify(s.choices ?? []),
    Number(s.start ?? 0),
    Number(s.end ?? 0),
    Number(s.created ?? 0),
    s.discussion || null,
    s.flagged ?? false,
    s.flagCode ?? 0,
    s.symbol ?? null,
    JSON.stringify(s.labels ?? []),
    s.quorum != null ? String(s.quorum) : null,
    s.quorumType ?? null,
    s.privacy ?? null,
    s.link ?? null,
    s.app ?? null,
    s.snapshot ?? null,
    s.state ?? "unknown",
    s.author ?? "",
    s.network ?? null,
    JSON.stringify(s.scores ?? null),
    JSON.stringify(s.scores_by_strategy ?? null),
    normalizeNumericValue(s.scores_total),
    s.scores_state ?? null,
    normalizeNumericValue(s.scores_total_value),
    s.scores_updated ? Number(s.scores_updated) : null,
    Number(s.votes ?? 0),
    s.updated ? Number(s.updated) : null,
    JSON.stringify(s.strategies ?? []),
    JSON.stringify(s.plugins ?? null),
    JSON.stringify(s),
  ];
}

const BATCH_COLUMNS = [
  "id", "space_id", "title", "body", "choices",
  "start_ts", "end_ts", "created_ts", "discussion",
  "flagged", "flag_code", "symbol", "labels",
  "quorum", "quorum_type", "privacy", "link", "app",
  "snapshot_block", "state", "author", "network",
  "scores", "scores_by_strategy", "scores_total",
  "scores_state", "scores_total_value", "scores_updated_ts",
  "votes_count", "updated_ts", "strategies", "plugins", "raw",
] as const;

/**
 * Batch upsert proposals using a single INSERT ... ON CONFLICT DO UPDATE
 * statement. Flushes every BATCH_FLUSH_SIZE (100) rows.
 *
 * @param databaseUrl - The Neon database connection string. Pass
 *   `DATABASE_URL_UNPOOLED || DATABASE_URL` from the caller's scope.
 * Returns the number of rows processed.
 */
export async function upsertProposalsBatch(
  databaseUrl: string,
  proposals: SnapshotProposal[]
): Promise<number> {
  if (proposals.length === 0) return 0;

  const BATCH_SIZE = BATCH_FLUSH_SIZE;
  let processed = 0;

  for (let offset = 0; offset < proposals.length; offset += BATCH_SIZE) {
    const batch = proposals.slice(offset, offset + BATCH_SIZE);
    const allParams: unknown[] = [];
    const valuePlaceholders: string[] = [];

    for (const proposal of batch) {
      const row = proposalToRow(proposal);
      const placeholders = row.map((_, i) => `$${allParams.length + i + 1}`);
      valuePlaceholders.push(`(${placeholders.join(", ")})`);
      allParams.push(...row);
    }

    // Build SET clause dynamically: "col = EXCLUDED.col" for every column
    const setClause = BATCH_COLUMNS
      .filter((col) => col !== "id") // skip PK
      .map((col) => `${col} = EXCLUDED.${col}`)
      .join(", ");

    const query = `
      INSERT INTO snapshot_proposals (${BATCH_COLUMNS.join(", ")})
      VALUES ${valuePlaceholders.join(", ")}
      ON CONFLICT (id) DO UPDATE SET ${setClause}
    `;

    const sql = neon(databaseUrl);
    await withDatabaseRetry(`upsertProposalsBatch(${batch.length})`, () =>
      sql.query(query, allParams) as unknown as Promise<unknown>
    );

    processed += batch.length;
  }

  return processed;
}

export async function refreshSpaceProposalCounts(db: SyncDb, spaceIds: string[]): Promise<void> {
  if (spaceIds.length === 0) return;

  // Build a safe string literal for text[] — avoids the Neon+NeonDbError type-cast bug
  // where Drizzle passes the array as "record" and PG cannot cast record to text[].
  const spaceIdsLiteral = drizzleSql.raw(
    `'{${spaceIds.map((id) => id.replace(/'/g, "''")).join(",")}}'`
  );

  await withDatabaseRetry("refreshSpaceProposalCounts", () =>
    db.execute(
      drizzleSql`
        update ${snapshotSpaces}
        set proposal_count = subq.count, updated_at = now()
        from (
          select ${snapshotProposals.spaceId} as sid, count(*)::int as count
          from ${snapshotProposals}
          where ${snapshotProposals.spaceId} = any(${spaceIdsLiteral}::text[])
          group by ${snapshotProposals.spaceId}
        ) subq
        where ${snapshotSpaces.id} = subq.sid
      `
    )
  );
}

export async function replaceSpaceMembers(db: SyncDb, spaceId: string, members: string[]): Promise<boolean> {
  const sanitizedMembers = sanitizeValue(members).filter((m): m is string => typeof m === "string" && m.length > 0);
  let performedFullReplace = false;

  try {
    await withDatabaseRetry(`replaceSpaceMembers.delete(${spaceId})`, () =>
      db.delete(snapshotSpaceMembers).where(eq(snapshotSpaceMembers.spaceId, spaceId))
    );
    performedFullReplace = true;
  } catch (error) {
    console.warn(`[spaces] failed to clear existing members for ${spaceId}; falling back to insert-only: ${stringifyError(error)}`);
  }

  if (sanitizedMembers.length === 0) return performedFullReplace;

  const chunkSize = 500;
  for (let i = 0; i < sanitizedMembers.length; i += chunkSize) {
    const chunk = sanitizedMembers.slice(i, i + chunkSize);
    await withDatabaseRetry(`replaceSpaceMembers.insert(${spaceId})#${i / chunkSize + 1}`, () =>
      db
        .insert(snapshotSpaceMembers)
        .values(chunk.map((member) => ({ spaceId, memberAddress: member })))
        .onConflictDoUpdate({
          target: [snapshotSpaceMembers.spaceId, snapshotSpaceMembers.memberAddress],
          set: { updatedAt: drizzleSql`now()` },
        })
    );
  }

  return performedFullReplace;
}

export async function syncSpaceMembersSafely(db: SyncDb, spaceId: string, members: string[]): Promise<boolean> {
  try {
    return await replaceSpaceMembers(db, spaceId, members);
  } catch (error) {
    console.warn(`[spaces] member sync failed for ${spaceId}: ${stringifyError(error)}`);
    return false;
  }
}

// ─── Sync run tracking ────────────────────────────────────────────────────────

export async function startSyncRun(db: SyncDb, entityType: string): Promise<number | undefined> {
  const rows = await withDatabaseRetry(`startSyncRun(${entityType})`, () =>
    db.insert(snapshotSyncRuns).values({ entityType, status: "running", rowsUpserted: 0 }).returning({ id: snapshotSyncRuns.id })
  );
  return rows[0]?.id;
}

export async function finishSyncRun(
  db: SyncDb,
  id: number | undefined,
  status: string,
  rowsUpserted: number,
  error: string | null = null
): Promise<void> {
  if (!id) return;
  await withDatabaseRetry(`finishSyncRun(${id})`, () =>
    db
      .update(snapshotSyncRuns)
      .set({ finishedAt: drizzleSql`now()`, updatedAt: drizzleSql`now()`, status, rowsUpserted, error })
      .where(eq(snapshotSyncRuns.id, id))
  );
}

export async function safelyFinishSyncRun(
  db: SyncDb,
  id: number | undefined,
  status: string,
  rowsUpserted: number,
  error: string | null = null
): Promise<void> {
  try {
    await finishSyncRun(db, id, status, rowsUpserted, error);
  } catch (finishError) {
    console.warn(`[sync-run] failed to persist run status for ${id ?? "unknown"}: ${stringifyError(finishError)}`);
  }
}

export async function getSyncState(db: SyncDb, entityType: string) {
  const rows = await withDatabaseRetry(`getSyncState(${entityType})`, () =>
    db.select().from(snapshotSyncState).where(eq(snapshotSyncState.entityType, entityType)).limit(1)
  );
  return rows[0] ?? null;
}

export async function upsertSyncState(
  db: SyncDb,
  entityType: string,
  patch: {
    last_success_at?: string | null;
    last_cursor?: string | null;
    last_created_ts?: number | null;
    last_error?: string | null;
  }
): Promise<void> {
  const previous = await getSyncState(db, entityType);
  const lastSuccessAt = normalizeDateValue("last_success_at" in patch ? patch.last_success_at : (previous?.lastSuccessAt ?? null));
  const lastCursor = "last_cursor" in patch ? patch.last_cursor : (previous?.lastCursor ?? null);
  const lastCreatedTs = "last_created_ts" in patch ? patch.last_created_ts : (previous?.lastCreatedTs ?? null);
  const lastError = "last_error" in patch ? patch.last_error : (previous?.lastError ?? null);

  await withDatabaseRetry(`upsertSyncState(${entityType})`, () =>
    db
      .insert(snapshotSyncState)
      .values({ entityType, lastSuccessAt, lastCursor, lastCreatedTs, lastError, updatedAt: drizzleSql`now()` })
      .onConflictDoUpdate({
        target: snapshotSyncState.entityType,
        set: { lastSuccessAt, lastCursor, lastCreatedTs, lastError, updatedAt: drizzleSql`now()` },
      })
  );
}

export async function safelyUpsertSyncState(
  db: SyncDb,
  entityType: string,
  patch: Parameters<typeof upsertSyncState>[2]
): Promise<void> {
  try {
    await upsertSyncState(db, entityType, patch);
  } catch (error) {
    console.warn(`[sync-state] failed to persist ${entityType} state: ${stringifyError(error)}`);
  }
}

export async function runSync(db: SyncDb, entityType: string, task: () => Promise<number>): Promise<void> {
  const runId = await startSyncRun(db, entityType);
  try {
    const rowsUpserted = await task();
    await safelyFinishSyncRun(db, runId, "success", rowsUpserted);
    await safelyUpsertSyncState(db, entityType, { last_success_at: new Date().toISOString(), last_error: null });
    console.log(`[${entityType}] synced ${rowsUpserted} rows`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safelyFinishSyncRun(db, runId, "failed", 0, message);
    await safelyUpsertSyncState(db, entityType, { last_error: message });
    throw error;
  }
}

export async function refreshPlatformStatsAfterSync(databaseUrl: string): Promise<void> {
  try {
    await refreshPlatformStats(databaseUrl);
    console.log("[platform_stats] refreshed");
  } catch (error) {
    console.warn(`[platform_stats] refresh failed: ${stringifyError(error)}`);
  }
}

/**
 * Invalidate Next.js data cache after a sync completes.
 * Calls the revalidation endpoint to purge cached pages/API responses.
 */
export async function revalidateDataCache(tags: string[]): Promise<void> {
  if (tags.length === 0) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    console.warn("[revalidate] NEXT_PUBLIC_BASE_URL not set, skipping cache invalidation");
    return;
  }

  for (const tag of tags) {
    try {
      const response = await fetch(`${baseUrl}/api/revalidate?tag=${encodeURIComponent(tag)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        console.warn(`[revalidate] tag "${tag}" failed: ${response.status} ${response.statusText}`);
      } else {
        console.log(`[revalidate] tag "${tag}" revalidated`);
      }
    } catch (error) {
      console.warn(`[revalidate] tag "${tag}" error: ${stringifyError(error)}`);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function sanitizeValue<T>(value: T): T {
  if (typeof value === "string") return value.replace(/\u0000/g, "") as T;
  if (Array.isArray(value)) return value.map((e) => sanitizeValue(e)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeValue(v)])) as T;
  }
  return value;
}

export function normalizeNumericValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function normalizeDateValue(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

export function parseCursorSkip(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseOptionalCursor(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isRetryableDatabaseError(error: unknown): boolean {
  const message = stringifyError(error).toLowerCase();
  return /fetch failed|error connecting to database|connection|timeout|temporar|network|econn|etimedout|socket/.test(message);
}

export function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function readArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

// Collect all values for a repeatable flag, e.g. --id a --id b → ["a", "b"]
export function readArgValues(flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && process.argv[i + 1]) {
      values.push(process.argv[i + 1]);
    }
  }
  return values;
}

export function readNumberArg(flag: string): number | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const raw = process.argv[index + 1];
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
