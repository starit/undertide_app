import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  snapshotSyncRuns,
  snapshotSyncState,
  tallyOrganizations,
  tallyProposals,
} from "../db/drizzle-schema";
import { GOVERNANCE_SOURCES } from "../lib/governance/sources";
import {
  createTallyClient,
  DEFAULT_TALLY_API_URL,
  TallyOrganization,
  TallyProposal,
} from "../lib/tally/client";

const TALLY_PAGE_SIZE = normalizeInteger(process.env.TALLY_PAGE_SIZE, 20, 1, 20);
const DEFAULT_ORGANIZATION_LIMIT = normalizeInteger(process.env.TALLY_ORGANIZATION_LIMIT, 100, 1, 100_000);
const DEFAULT_PROPOSALS_PER_ORGANIZATION = normalizeInteger(
  process.env.TALLY_PROPOSALS_PER_ORGANIZATION,
  20,
  1,
  100_000
);
const DEFAULT_PROPOSAL_ORGANIZATION_LIMIT = normalizeInteger(
  process.env.TALLY_PROPOSAL_ORGANIZATION_LIMIT,
  50,
  1,
  100_000
);
const DATABASE_RETRY_LIMIT = 4;
const DATABASE_RETRY_BASE_MS = 1000;
const TALLY_SOURCE = GOVERNANCE_SOURCES.tally;

const args = new Set(process.argv.slice(2));
const options = {
  full: args.has("--full"),
  organizationsOnly: args.has("--organizations-only"),
  proposalsOnly: args.has("--proposals-only"),
  organizationIds: readRepeatedStringArg("--organization-id"),
  organizationSlugs: readRepeatedStringArg("--organization-slug"),
  limitOrganizations: readNumberArg("--limit-organizations") ?? DEFAULT_ORGANIZATION_LIMIT,
  limitProposals: args.has("--full")
    ? Number.MAX_SAFE_INTEGER
    : readNumberArg("--limit-proposals") ?? DEFAULT_PROPOSALS_PER_ORGANIZATION,
  proposalOrganizationLimit:
    readNumberArg("--proposal-organization-limit") ?? DEFAULT_PROPOSAL_ORGANIZATION_LIMIT,
};

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const tallyApiKey = process.env.TALLY_API_KEY;
const tallyApiUrl = process.env.TALLY_API_URL || DEFAULT_TALLY_API_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

if (!tallyApiKey) {
  throw new Error("TALLY_API_KEY is required.");
}

const sql = neon(databaseUrl);
const db = drizzle(sql, {
  schema: {
    snapshotSyncRuns,
    snapshotSyncState,
    tallyOrganizations,
    tallyProposals,
  },
});
const tally = createTallyClient({ apiKey: tallyApiKey, apiUrl: tallyApiUrl });

async function main() {
  console.log("Starting Tally sync...");

  if (!options.proposalsOnly) {
    await runSync(TALLY_SOURCE.spaceEntityType, syncOrganizations);
  }

  if (!options.organizationsOnly) {
    await runSync(TALLY_SOURCE.proposalEntityType, syncProposals);
  }

  console.log("Tally sync completed.");
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
    const message = stringifyError(error);
    await safelyFinishSyncRun(runId, "failed", 0, message);
    await safelyUpsertSyncState(entityType, {
      last_error: message,
    });
    throw error;
  }
}

async function syncOrganizations() {
  if (options.organizationIds.length > 0 || options.organizationSlugs.length > 0) {
    return syncSelectedOrganizations();
  }

  const previousState = options.full ? null : await getSyncState(TALLY_SOURCE.spaceEntityType);
  let cursor = options.full ? null : previousState?.lastCursor ?? null;
  let upserted = 0;
  let fetched = 0;

  while (fetched < options.limitOrganizations) {
    const pageLimit = Math.min(TALLY_PAGE_SIZE, options.limitOrganizations - fetched);
    const page = await tally.listOrganizations({
      page: {
        limit: pageLimit,
        afterCursor: cursor,
      },
    });

    const organizations = page.nodes.filter(isTallyOrganization);
    if (organizations.length === 0) break;

    const filtered = organizations.filter(matchesOrganizationFilter);
    for (const organization of filtered) {
      await upsertOrganization(organization);
      upserted += 1;
    }

    fetched += organizations.length;
    cursor = page.pageInfo.lastCursor;
    await safelyUpsertSyncState(TALLY_SOURCE.spaceEntityType, {
      last_cursor: cursor,
    });
    console.log(`[${TALLY_SOURCE.spaceEntityType}] fetched ${fetched}, upserted ${upserted}`);

    if (!cursor || organizations.length < pageLimit) break;
  }

  await safelyUpsertSyncState(TALLY_SOURCE.spaceEntityType, {
    last_cursor: null,
  });

  return upserted;
}

async function syncSelectedOrganizations() {
  const seen = new Set<string>();
  let upserted = 0;

  for (const organizationId of options.organizationIds) {
    const organization = await tally.getOrganization({ id: organizationId });
    if (!organization || !isTallyOrganization(organization)) continue;

    const id = String(organization.id);
    if (seen.has(id)) continue;
    seen.add(id);

    await upsertOrganization(organization);
    upserted += 1;
  }

  for (const organizationSlug of options.organizationSlugs) {
    const organization = await tally.getOrganization({ slug: organizationSlug });
    if (!organization || !isTallyOrganization(organization)) continue;

    const id = String(organization.id);
    if (seen.has(id)) continue;
    seen.add(id);

    await upsertOrganization(organization);
    upserted += 1;
  }

  await safelyUpsertSyncState(TALLY_SOURCE.spaceEntityType, {
    last_cursor: null,
  });

  return upserted;
}

async function syncProposals() {
  const organizations = await getOrganizationsForProposalSync();
  let upserted = 0;
  let highestCreatedTs = 0;

  for (const organization of organizations) {
    const governorIds = normalizeGovernorIdList(organization.governorIds);
    const orgBudget = { remaining: options.limitProposals };

    if (governorIds.length > 0) {
      for (const governorId of governorIds) {
        if (orgBudget.remaining <= 0) break;

        try {
          const batch = await syncProposalsForOrgWithFilters(organization, { governorId }, orgBudget);
          upserted += batch.upserted;
          highestCreatedTs = Math.max(highestCreatedTs, batch.highestCreatedTs);
        } catch (error) {
          if (isUnsupportedChainTallyError(error)) {
            console.warn(
              `[${TALLY_SOURCE.proposalEntityType}] ${organization.slug ?? organization.id}: skipping governor (unsupported chain): ${governorId}`
            );
            continue;
          }
          throw error;
        }
      }
    } else {
      try {
        const batch = await syncProposalsForOrgWithFilters(organization, {}, orgBudget);
        upserted += batch.upserted;
        highestCreatedTs = Math.max(highestCreatedTs, batch.highestCreatedTs);
      } catch (error) {
        if (isUnsupportedChainTallyError(error)) {
          throw new Error(
            `[${organization.slug ?? organization.id}] Tally returned "chain id is not supported" for organization-wide proposals. ` +
              "Run organization sync first (`pnpm sync:tally --organizations-only`) so `governor_ids` is stored; proposal sync then queries per-governor to avoid mixed-chain batches."
          );
        }
        throw error;
      }
    }
  }

  await safelyUpsertSyncState(TALLY_SOURCE.proposalEntityType, {
    last_cursor: null,
    last_created_ts: highestCreatedTs || null,
  });

  return upserted;
}

async function syncProposalsForOrgWithFilters(
  organization: TallyOrganizationSyncRow,
  extraFilters: { governorId?: string },
  budget: { remaining: number }
) {
  let upserted = 0;
  let highestCreatedTs = 0;
  let cursor: string | null = null;
  let fetchedForScope = 0;
  const scopeLabel = extraFilters.governorId ?? "all governors";

  while (budget.remaining > 0) {
    const pageLimit = Math.min(TALLY_PAGE_SIZE, budget.remaining);
    const page = await tally.listProposals({
      filters: {
        organizationId: organization.id,
        ...extraFilters,
      },
      page: {
        limit: pageLimit,
        afterCursor: cursor,
      },
    });

    const proposals = page.nodes.filter(isTallyProposal);
    if (proposals.length === 0) break;

    for (const proposal of proposals) {
      await upsertProposal(proposal, organization);
      highestCreatedTs = Math.max(highestCreatedTs, normalizeTimestampToUnixSeconds(proposal.block) ?? 0);
      upserted += 1;
    }

    budget.remaining -= proposals.length;
    fetchedForScope += proposals.length;
    cursor = page.pageInfo.lastCursor;
    await safelyUpsertSyncState(TALLY_SOURCE.proposalEntityType, {
      last_cursor: JSON.stringify({
        organizationId: organization.id,
        governorId: extraFilters.governorId ?? null,
        afterCursor: cursor,
      }),
    });
    console.log(
      `[${TALLY_SOURCE.proposalEntityType}] ${organization.slug ?? organization.id} (${scopeLabel}): fetched ${fetchedForScope}`
    );

    if (!cursor || proposals.length < pageLimit) break;
  }

  return { upserted, highestCreatedTs };
}

async function upsertOrganization(organization: TallyOrganization) {
  const sanitized = sanitizeValue(organization);
  const metadata = sanitized.metadata ?? {};
  const id = String(sanitized.id);
  const slug = sanitized.slug?.trim() || id;
  const name = sanitized.name?.trim() || slug;

  await withDatabaseRetry(`upsertOrganization(${id})`, async () => {
    await db
      .insert(tallyOrganizations)
      .values({
        id,
        slug,
        name,
        description: metadata.description ?? null,
        icon: metadata.icon ?? null,
        color: metadata.color ?? null,
        chainIds: normalizeStringArray(sanitized.chainIds),
        tokenIds: normalizeStringArray(sanitized.tokenIds),
        governorIds: normalizeStringArray(sanitized.governorIds),
        hasActiveProposals: Boolean(sanitized.hasActiveProposals),
        proposalsCount: normalizeIntegerValue(sanitized.proposalsCount),
        delegatesCount: normalizeIntegerValue(sanitized.delegatesCount),
        delegatesVotesCount: normalizeNumericValue(sanitized.delegatesVotesCount),
        tokenOwnersCount: normalizeIntegerValue(sanitized.tokenOwnersCount),
        raw: sanitized as Record<string, unknown>,
        syncedAt: drizzleSql`now()`,
        updatedAt: drizzleSql`now()`,
      })
      .onConflictDoUpdate({
        target: tallyOrganizations.id,
        set: {
          slug,
          name,
          description: metadata.description ?? null,
          icon: metadata.icon ?? null,
          color: metadata.color ?? null,
          chainIds: normalizeStringArray(sanitized.chainIds),
          tokenIds: normalizeStringArray(sanitized.tokenIds),
          governorIds: normalizeStringArray(sanitized.governorIds),
          hasActiveProposals: Boolean(sanitized.hasActiveProposals),
          proposalsCount: normalizeIntegerValue(sanitized.proposalsCount),
          delegatesCount: normalizeIntegerValue(sanitized.delegatesCount),
          delegatesVotesCount: normalizeNumericValue(sanitized.delegatesVotesCount),
          tokenOwnersCount: normalizeIntegerValue(sanitized.tokenOwnersCount),
          raw: sanitized as Record<string, unknown>,
          syncedAt: drizzleSql`now()`,
          updatedAt: drizzleSql`now()`,
        },
      });
  });
}

async function upsertProposal(
  proposal: TallyProposal,
  fallbackOrganization: Pick<typeof tallyOrganizations.$inferSelect, "id" | "slug" | "name">
) {
  const sanitized = sanitizeValue(proposal);
  const metadata = (sanitized.metadata ?? {}) as Record<string, unknown>;
  const organization = sanitized.organization ?? fallbackOrganization;
  const governor = sanitized.governor ?? {};
  const id = String(sanitized.id);
  const organizationId = organization.id ? String(organization.id) : fallbackOrganization.id;
  const organizationSlug = organization.slug ?? fallbackOrganization.slug;
  const organizationName = organization.name ?? fallbackOrganization.name;

  const proposalValues = {
    onchainId: sanitized.onchainId != null ? String(sanitized.onchainId) : null,
    organizationId,
    organizationSlug,
    organizationName,
    governorId: governor.id != null ? String(governor.id) : null,
    governorSlug: governor.slug ?? null,
    governorName: governor.name ?? null,
    chainId: sanitized.chainId != null ? String(sanitized.chainId) : null,
    status: sanitized.status ?? "unknown",
    title: getMetadataString(metadata, "title") || `Tally proposal ${id}`,
    description: getMetadataString(metadata, "description") || null,
    proposerAddress: sanitized.proposer?.address ?? null,
    creatorAddress: sanitized.creator?.address ?? null,
    quorum: normalizeNumericValue(sanitized.quorum),
    startTs: normalizeTimestampToUnixSeconds(sanitized.start),
    endTs: normalizeTimestampToUnixSeconds(sanitized.end),
    createdTs: normalizeTimestampToUnixSeconds(sanitized.block),
    voteStats: sanitized.voteStats ?? null,
    metadata,
    raw: sanitized as Record<string, unknown>,
    syncedAt: drizzleSql`now()`,
    updatedAt: drizzleSql`now()`,
  };

  await withDatabaseRetry(`upsertProposal(${id})`, async () => {
    await db
      .insert(tallyProposals)
      .values({
        id,
        ...proposalValues,
      })
      .onConflictDoUpdate({
        target: tallyProposals.id,
        set: proposalValues,
      });
  });
}

async function getOrganizationsForProposalSync(): Promise<TallyOrganizationSyncRow[]> {
  return withDatabaseRetry("getOrganizationsForProposalSync", async () => {
    const conditions = [
      options.organizationIds.length > 0 ? inArray(tallyOrganizations.id, options.organizationIds) : undefined,
      options.organizationSlugs.length > 0 ? inArray(tallyOrganizations.slug, options.organizationSlugs) : undefined,
    ].filter((condition) => condition !== undefined);

    const query = db
      .select({
        id: tallyOrganizations.id,
        slug: tallyOrganizations.slug,
        name: tallyOrganizations.name,
        governorIds: tallyOrganizations.governorIds,
      })
      .from(tallyOrganizations);

    if (conditions.length > 0) {
      return query
        .where(and(...conditions))
        .orderBy(desc(tallyOrganizations.hasActiveProposals), desc(tallyOrganizations.proposalsCount), tallyOrganizations.name);
    }

    return query
      .orderBy(desc(tallyOrganizations.hasActiveProposals), desc(tallyOrganizations.proposalsCount), tallyOrganizations.name)
      .limit(options.proposalOrganizationLimit);
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
  const lastSuccessAt = normalizeDateValue(patch.last_success_at ?? previous.lastSuccessAt ?? null);

  await withDatabaseRetry(`upsertSyncState(${entityType})`, async () => {
    await db
      .insert(snapshotSyncState)
      .values({
        entityType,
        lastSuccessAt,
        lastCursor: patch.last_cursor ?? previous.lastCursor ?? null,
        lastCreatedTs: patch.last_created_ts ?? previous.lastCreatedTs ?? null,
        lastError: patch.last_error ?? null,
        updatedAt: drizzleSql`now()`,
      })
      .onConflictDoUpdate({
        target: snapshotSyncState.entityType,
        set: {
          lastSuccessAt,
          lastCursor: patch.last_cursor ?? previous.lastCursor ?? null,
          lastCreatedTs: patch.last_created_ts ?? previous.lastCreatedTs ?? null,
          lastError: patch.last_error ?? null,
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

function isTallyOrganization(value: TallyOrganization): value is TallyOrganization & { id: string | number } {
  return value.id !== null && value.id !== undefined && value.id !== "";
}

function isTallyProposal(value: TallyProposal): value is TallyProposal & { id: string | number } {
  return value.id !== null && value.id !== undefined && value.id !== "";
}

function matchesOrganizationFilter(organization: TallyOrganization) {
  const id = String(organization.id);
  const slug = organization.slug ?? "";

  if (options.organizationIds.length > 0 && !options.organizationIds.includes(id)) {
    return false;
  }

  if (options.organizationSlugs.length > 0 && !options.organizationSlugs.includes(slug)) {
    return false;
  }

  return true;
}

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

function normalizeStringArray(value: Array<string | number> | null | undefined) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function normalizeIntegerValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeNumericValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function normalizeTimestampToUnixSeconds(value: TallyTimestampValue | null | undefined) {
  const rawValue: string | number | null | undefined =
    value && typeof value === "object" ? value.timestamp : value;
  if (rawValue === null || rawValue === undefined) return null;

  if (typeof rawValue === "number") {
    if (!Number.isFinite(rawValue) || rawValue <= 0) return null;
    return rawValue > 10_000_000_000 ? Math.floor(rawValue / 1000) : Math.floor(rawValue);
  }

  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 1000);
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDateValue(value: string | Date | null | undefined) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

function normalizeInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readNumberArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;

  const raw = process.argv[index + 1];
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readRepeatedStringArg(flag: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag) {
      const value = process.argv[index + 1]?.trim();
      if (value) values.push(value);
    }
  }
  return values;
}

function isRetryableDatabaseError(error: unknown) {
  const message = stringifyError(error).toLowerCase();
  return /fetch failed|error connecting to database|connection|timeout|temporar|network|econn|etimedout|socket/.test(message);
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

type TallyOrganizationSyncRow = {
  id: string;
  slug: string;
  name: string;
  governorIds: string[];
};

function normalizeGovernorIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function isUnsupportedChainTallyError(error: unknown) {
  return /chain id is not supported/i.test(stringifyError(error));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TallyTimestampValue = TallyProposal["block"] | TallyProposal["start"] | TallyProposal["end"] | string | number;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
