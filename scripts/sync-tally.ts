import "dotenv/config";
import { and, count, desc, eq, inArray, max, sql as drizzleSql } from "drizzle-orm";
import { tallyOrganizations, tallyProposals } from "../db/drizzle-schema";
import { GOVERNANCE_SOURCES } from "../lib/governance/sources";
import {
  createTallyClient,
  DEFAULT_TALLY_API_URL,
  type TallyOrganization,
  type TallyProposal,
} from "../lib/tally/client";
import {
  createDb,
  getSyncState,
  normalizeNumericValue,
  readArgValues,
  readNumberArg,
  refreshPlatformStatsAfterSync,
  runSync,
  safelyUpsertSyncState,
  sanitizeValue,
  stringifyError,
  withDatabaseRetry,
} from "./sync-snapshot-shared";

// ─── Config ───────────────────────────────────────────────────────────────────

const TALLY_PAGE_SIZE = normalizeInteger(process.env.TALLY_PAGE_SIZE, 20, 1, 20);
// Default to effectively unlimited so all Tally orgs are always scanned.
// Override via env to cap cost / time in environments with many orgs.
const DEFAULT_ORGANIZATION_LIMIT = normalizeInteger(process.env.TALLY_ORGANIZATION_LIMIT, 100_000, 1, 100_000);
// Per-org proposal cap for incremental sync. Watermark causes early termination so 50 is plenty.
const DEFAULT_PROPOSALS_PER_ORGANIZATION = normalizeInteger(process.env.TALLY_PROPOSALS_PER_ORGANIZATION, 50, 1, 100_000);
// Default to unlimited so ALL synced orgs get their proposals checked on each run.
const DEFAULT_PROPOSAL_ORGANIZATION_LIMIT = normalizeInteger(process.env.TALLY_PROPOSAL_ORGANIZATION_LIMIT, 100_000, 1, 100_000);
// Per-org proposal cap for the active-refresh pass (no watermark, always newest-first).
const DEFAULT_ACTIVE_REFRESH_LIMIT = normalizeInteger(process.env.TALLY_ACTIVE_REFRESH_LIMIT, 50, 1, 100_000);
const TALLY_SOURCE = GOVERNANCE_SOURCES.tally;

const TALLY_BACKFILL_ENTITY = "tally:proposals-backfill";

const args = new Set(process.argv.slice(2));
const options = {
  full: args.has("--full"),
  backfill: args.has("--backfill"),
  organizationsOnly: args.has("--organizations-only"),
  proposalsOnly: args.has("--proposals-only"),
  organizationIds: readArgValues("--organization-id"),
  organizationSlugs: readArgValues("--organization-slug"),
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

if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
if (!tallyApiKey) throw new Error("TALLY_API_KEY is required.");

const db = createDb(databaseUrl);
const tally = createTallyClient({ apiKey: tallyApiKey, apiUrl: tallyApiUrl });

// ─── Counts ───────────────────────────────────────────────────────────────────

async function getDbOrgCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(tallyOrganizations);
  return Number(row?.n ?? 0);
}

async function getDbProposalCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(tallyProposals);
  return Number(row?.n ?? 0);
}

async function getOrgProposalWatermark(organizationId: string): Promise<number> {
  const [row] = await withDatabaseRetry(`getOrgProposalWatermark(${organizationId})`, () =>
    db
      .select({ maxTs: max(tallyProposals.createdTs) })
      .from(tallyProposals)
      .where(eq(tallyProposals.organizationId, organizationId))
  );
  return row?.maxTs ? Number(row.maxTs) : 0;
}

// ─── Organization sync ────────────────────────────────────────────────────────

async function syncOrganizations(): Promise<number> {
  if (options.organizationIds.length > 0 || options.organizationSlugs.length > 0) {
    return syncSelectedOrganizations();
  }

  const previousState = options.full ? null : await getSyncState(db, TALLY_SOURCE.spaceEntityType);
  let cursor: string | null = previousState?.lastCursor ?? null;
  let upserted = 0;
  let fetched = 0;
  let remoteTotalLogged = false;

  while (fetched < options.limitOrganizations) {
    const pageLimit = Math.min(TALLY_PAGE_SIZE, options.limitOrganizations - fetched);
    const page = await tally.listOrganizations({
      sort: { sortBy: "id", isDescending: false },
      page: { limit: pageLimit, afterCursor: cursor },
    });

    if (!remoteTotalLogged) {
      console.log(`[${TALLY_SOURCE.spaceEntityType}] remote total: ${page.pageInfo.count}`);
      remoteTotalLogged = true;
    }

    const organizations = page.nodes.filter(isTallyOrganization);
    if (organizations.length === 0) break;

    for (const organization of organizations.filter(matchesOrganizationFilter)) {
      await upsertOrganization(organization);
      upserted += 1;
    }

    fetched += organizations.length;
    cursor = page.pageInfo.lastCursor;
    await safelyUpsertSyncState(db, TALLY_SOURCE.spaceEntityType, { last_cursor: cursor });
    console.log(`[${TALLY_SOURCE.spaceEntityType}] fetched ${fetched}, upserted ${upserted}`);

    if (!cursor || organizations.length < pageLimit) break;
  }

  await safelyUpsertSyncState(db, TALLY_SOURCE.spaceEntityType, { last_cursor: null });
  return upserted;
}

async function syncSelectedOrganizations(): Promise<number> {
  const seen = new Set<string>();
  let upserted = 0;

  for (const organizationId of options.organizationIds) {
    console.log(`[${TALLY_SOURCE.spaceEntityType}] → Tally getOrganization id=${organizationId}`);
    const org = await tally.getOrganization({ id: organizationId });
    if (!org || !isTallyOrganization(org)) {
      console.warn(`[${TALLY_SOURCE.spaceEntityType}] ← not found or invalid: id=${organizationId}`);
      continue;
    }
    const id = String(org.id);
    if (seen.has(id)) continue;
    seen.add(id);
    console.log(`[${TALLY_SOURCE.spaceEntityType}] ← found: ${org.slug ?? id} (${org.name ?? "no name"}), proposals=${org.proposalsCount ?? "?"}`);
    await upsertOrganization(org);
    console.log(`[${TALLY_SOURCE.spaceEntityType}] db: upserted organization ${id}`);
    upserted += 1;
  }

  for (const slug of options.organizationSlugs) {
    console.log(`[${TALLY_SOURCE.spaceEntityType}] → Tally getOrganization slug=${slug}`);
    const org = await tally.getOrganization({ slug });
    if (!org || !isTallyOrganization(org)) {
      console.warn(`[${TALLY_SOURCE.spaceEntityType}] ← not found or invalid: slug=${slug}`);
      continue;
    }
    const id = String(org.id);
    if (seen.has(id)) continue;
    seen.add(id);
    console.log(`[${TALLY_SOURCE.spaceEntityType}] ← found: ${org.slug ?? id} (${org.name ?? "no name"}), proposals=${org.proposalsCount ?? "?"}`);
    await upsertOrganization(org);
    console.log(`[${TALLY_SOURCE.spaceEntityType}] db: upserted organization ${id}`);
    upserted += 1;
  }

  await safelyUpsertSyncState(db, TALLY_SOURCE.spaceEntityType, { last_cursor: null });
  return upserted;
}

// ─── Proposal sync ────────────────────────────────────────────────────────────

async function syncProposals(): Promise<number> {
  const organizations = await getOrganizationsForProposalSync();
  let upserted = 0;
  let highestCreatedTs = 0;

  // Stage 1: incremental — newest-first per org, stops at watermark
  for (const organization of organizations) {
    const governorIds = normalizeGovernorIdList(organization.governorIds);
    const orgBudget = { remaining: options.limitProposals };

    if (governorIds.length > 0) {
      for (const governorId of governorIds) {
        if (orgBudget.remaining <= 0) break;
        try {
          const batch = await syncProposalsForOrg(organization, { governorId }, orgBudget);
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
        const batch = await syncProposalsForOrg(organization, {}, orgBudget);
        upserted += batch.upserted;
        highestCreatedTs = Math.max(highestCreatedTs, batch.highestCreatedTs);
      } catch (error) {
        if (isUnsupportedChainTallyError(error)) {
          throw new Error(
            `[${organization.slug ?? organization.id}] Tally returned "chain id is not supported" for organization-wide proposals. ` +
              "Run organization sync first (`pnpm sync:tally --organizations-only`) so governor_ids is populated."
          );
        }
        throw error;
      }
    }
  }

  await safelyUpsertSyncState(db, TALLY_SOURCE.proposalEntityType, {
    last_cursor: null,
    last_created_ts: highestCreatedTs || null,
  });

  // Stage 2: active refresh — re-fetch recent proposals for orgs with ongoing votes
  // Skipped when --full (already fetched everything) or --proposals-only with no org filter
  if (!options.full) {
    upserted += await syncActiveProposals();
  }

  return upserted;
}

// Stage 2: re-fetch the N most recent proposals for every org Tally flags as having
// active proposals. Vote counts and status change continuously on-chain, so these
// need a refresh pass independent of the incremental watermark.
async function syncActiveProposals(): Promise<number> {
  const activeOrgs = await withDatabaseRetry("getActiveOrgsForRefresh", () =>
    db
      .select({
        id: tallyOrganizations.id,
        slug: tallyOrganizations.slug,
        name: tallyOrganizations.name,
        governorIds: tallyOrganizations.governorIds,
      })
      .from(tallyOrganizations)
      .where(eq(tallyOrganizations.hasActiveProposals, true))
      .orderBy(desc(tallyOrganizations.proposalsCount))
  );

  if (activeOrgs.length === 0) {
    console.log(`[${TALLY_SOURCE.proposalEntityType}:active] no orgs with active proposals`);
    return 0;
  }

  console.log(`[${TALLY_SOURCE.proposalEntityType}:active] refreshing ${activeOrgs.length} orgs with active proposals (no watermark)`);
  let upserted = 0;

  for (const org of activeOrgs) {
    const governorIds = normalizeGovernorIdList(org.governorIds);
    const budget = { remaining: DEFAULT_ACTIVE_REFRESH_LIMIT };

    if (governorIds.length > 0) {
      for (const governorId of governorIds) {
        if (budget.remaining <= 0) break;
        try {
          const batch = await syncProposalsForOrg(org, { governorId }, budget, true);
          upserted += batch.upserted;
        } catch (error) {
          if (isUnsupportedChainTallyError(error)) {
            console.warn(`[${TALLY_SOURCE.proposalEntityType}:active] ${org.slug ?? org.id}: skipping governor (unsupported chain): ${governorId}`);
            continue;
          }
          console.warn(`[${TALLY_SOURCE.proposalEntityType}:active] ${org.slug ?? org.id}: error refreshing governor ${governorId}: ${stringifyError(error)}`);
        }
      }
    } else {
      try {
        const batch = await syncProposalsForOrg(org, {}, budget, true);
        upserted += batch.upserted;
      } catch (error) {
        console.warn(`[${TALLY_SOURCE.proposalEntityType}:active] ${org.slug ?? org.id}: error during active refresh: ${stringifyError(error)}`);
      }
    }
  }

  console.log(`[${TALLY_SOURCE.proposalEntityType}:active] done upserted=${upserted}`);
  return upserted;
}

async function syncProposalsForOrg(
  organization: TallyOrganizationSyncRow,
  extraFilters: { governorId?: string },
  budget: { remaining: number },
  noWatermark = false
): Promise<{ upserted: number; highestCreatedTs: number }> {
  // Stateless watermark — derive from what's already in the DB for this org.
  // Skipped when --full is set or noWatermark=true (active-refresh pass).
  const orgWatermark = (options.full || noWatermark) ? 0 : await getOrgProposalWatermark(organization.id);

  let upserted = 0;
  let highestCreatedTs = 0;
  let cursor: string | null = null;
  let fetchedForScope = 0;
  const scopeLabel = extraFilters.governorId ?? "all governors";

  while (budget.remaining > 0) {
    const pageLimit = Math.min(TALLY_PAGE_SIZE, budget.remaining);
    const page = await tally.listProposals({
      filters: { organizationId: organization.id, ...extraFilters },
      sort: { sortBy: "id", isDescending: true }, // newest first → enables early termination
      page: { limit: pageLimit, afterCursor: cursor },
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

    console.log(
      `[${TALLY_SOURCE.proposalEntityType}] ${organization.slug ?? organization.id} (${scopeLabel}): fetched ${fetchedForScope}`
    );

    // Oldest in this page — if already synced, no need to fetch further pages
    const oldestTs = Math.min(...proposals.map((p) => normalizeTimestampToUnixSeconds(p.block) ?? Infinity));
    if (orgWatermark > 0 && Number.isFinite(oldestTs) && oldestTs <= orgWatermark) {
      console.log(
        `[${TALLY_SOURCE.proposalEntityType}] ${organization.slug ?? organization.id}: reached watermark, stopping`
      );
      break;
    }

    if (!cursor || proposals.length < pageLimit) break;
  }

  return { upserted, highestCreatedTs };
}

// ─── Upserts ──────────────────────────────────────────────────────────────────

async function upsertOrganization(organization: TallyOrganization): Promise<void> {
  const s = sanitizeValue(organization);
  const metadata = s.metadata ?? {};
  const id = String(s.id);
  const slug = s.slug?.trim() || id;
  const name = s.name?.trim() || slug;

  const values = {
    slug,
    name,
    description: metadata.description ?? null,
    icon: metadata.icon ?? null,
    color: metadata.color ?? null,
    chainIds: normalizeStringArray(s.chainIds),
    tokenIds: normalizeStringArray(s.tokenIds),
    governorIds: normalizeStringArray(s.governorIds),
    hasActiveProposals: Boolean(s.hasActiveProposals),
    proposalsCount: normalizeIntegerValue(s.proposalsCount),
    delegatesCount: normalizeIntegerValue(s.delegatesCount),
    delegatesVotesCount: normalizeNumericValue(s.delegatesVotesCount),
    tokenOwnersCount: normalizeIntegerValue(s.tokenOwnersCount),
    raw: s as Record<string, unknown>,
    syncedAt: drizzleSql`now()`,
    updatedAt: drizzleSql`now()`,
  };

  await withDatabaseRetry(`upsertOrganization(${id})`, () =>
    db
      .insert(tallyOrganizations)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: tallyOrganizations.id, set: values })
  );
}

async function upsertProposal(
  proposal: TallyProposal,
  fallbackOrganization: Pick<typeof tallyOrganizations.$inferSelect, "id" | "slug" | "name">
): Promise<void> {
  const s = sanitizeValue(proposal);
  const metadata = (s.metadata ?? {}) as Record<string, unknown>;
  const organization = s.organization ?? fallbackOrganization;
  const governor = s.governor ?? {};
  const id = String(s.id);
  const organizationId = organization.id ? String(organization.id) : fallbackOrganization.id;

  const values = {
    onchainId: s.onchainId != null ? String(s.onchainId) : null,
    organizationId,
    organizationSlug: organization.slug ?? fallbackOrganization.slug,
    organizationName: organization.name ?? fallbackOrganization.name,
    governorId: governor.id != null ? String(governor.id) : null,
    governorSlug: governor.slug ?? null,
    governorName: governor.name ?? null,
    chainId: s.chainId != null ? String(s.chainId) : null,
    status: s.status ?? "unknown",
    title: getMetadataString(metadata, "title") || `Tally proposal ${id}`,
    description: getMetadataString(metadata, "description") || null,
    proposerAddress: s.proposer?.address ?? null,
    creatorAddress: s.creator?.address ?? null,
    quorum: normalizeNumericValue(s.quorum),
    startTs: normalizeTimestampToUnixSeconds(s.start),
    endTs: normalizeTimestampToUnixSeconds(s.end),
    createdTs: normalizeTimestampToUnixSeconds(s.block),
    voteStats: s.voteStats ?? null,
    metadata,
    raw: s as Record<string, unknown>,
    syncedAt: drizzleSql`now()`,
    updatedAt: drizzleSql`now()`,
  };

  await withDatabaseRetry(`upsertProposal(${id})`, () =>
    db
      .insert(tallyProposals)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: tallyProposals.id, set: values })
  );
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

// Returns all orgs ordered by numeric id ASC, optionally resuming after a given id.
// Numeric cast ensures "10" sorts correctly after "9" (plain text sort breaks for integer ids).
async function getAllOrgsForBackfill(afterId?: string): Promise<TallyOrganizationSyncRow[]> {
  const baseQuery = db
    .select({
      id: tallyOrganizations.id,
      slug: tallyOrganizations.slug,
      name: tallyOrganizations.name,
      governorIds: tallyOrganizations.governorIds,
    })
    .from(tallyOrganizations);

  if (afterId) {
    return baseQuery
      .where(drizzleSql`CAST(${tallyOrganizations.id} AS BIGINT) > ${Number(afterId)}`)
      .orderBy(drizzleSql`CAST(${tallyOrganizations.id} AS BIGINT) ASC`);
  }

  return baseQuery.orderBy(drizzleSql`CAST(${tallyOrganizations.id} AS BIGINT) ASC`);
}

async function runTallyBackfill(): Promise<number> {
  const state = await getSyncState(db, TALLY_BACKFILL_ENTITY);
  const resumeAfterId = state?.lastCursor ?? undefined;

  const orgs = await getAllOrgsForBackfill(resumeAfterId);
  console.log(
    `[${TALLY_BACKFILL_ENTITY}] ${orgs.length} orgs to backfill` +
      (resumeAfterId ? ` (resuming after id=${resumeAfterId})` : "")
  );

  if (orgs.length === 0) {
    console.log(`[${TALLY_BACKFILL_ENTITY}] nothing to do — all orgs already backfilled`);
    await safelyUpsertSyncState(db, TALLY_BACKFILL_ENTITY, { last_cursor: null });
    return 0;
  }

  let upserted = 0;

  for (const org of orgs) {
    const governorIds = normalizeGovernorIdList(org.governorIds);
    // Unlimited budget — backfill fetches complete history for every org
    const budget = { remaining: Number.MAX_SAFE_INTEGER };

    if (governorIds.length > 0) {
      for (const governorId of governorIds) {
        if (budget.remaining <= 0) break;
        try {
          const batch = await syncProposalsForOrg(org, { governorId }, budget, true);
          upserted += batch.upserted;
        } catch (error) {
          if (isUnsupportedChainTallyError(error)) {
            console.warn(
              `[${TALLY_BACKFILL_ENTITY}] ${org.slug ?? org.id}: skipping governor (unsupported chain): ${governorId}`
            );
            continue;
          }
          throw error;
        }
      }
    } else {
      try {
        const batch = await syncProposalsForOrg(org, {}, budget, true);
        upserted += batch.upserted;
      } catch (error) {
        if (isUnsupportedChainTallyError(error)) {
          console.warn(`[${TALLY_BACKFILL_ENTITY}] ${org.slug ?? org.id}: skipping (unsupported chain)`);
        } else {
          throw error;
        }
      }
    }

    // Checkpoint after each org so an interrupted run can resume
    await safelyUpsertSyncState(db, TALLY_BACKFILL_ENTITY, { last_cursor: org.id });
    console.log(
      `[${TALLY_BACKFILL_ENTITY}] completed org ${org.slug ?? org.id} (id=${org.id}), total upserted=${upserted}`
    );
  }

  // Clear cursor so the next monthly run is a fresh full scan
  await safelyUpsertSyncState(db, TALLY_BACKFILL_ENTITY, { last_cursor: null });
  return upserted;
}

// ─── DB queries ───────────────────────────────────────────────────────────────

async function getOrganizationsForProposalSync(): Promise<TallyOrganizationSyncRow[]> {
  const rows = await withDatabaseRetry("getOrganizationsForProposalSync", () => {
    const conditions = [
      options.organizationIds.length > 0 ? inArray(tallyOrganizations.id, options.organizationIds) : undefined,
      options.organizationSlugs.length > 0 ? inArray(tallyOrganizations.slug, options.organizationSlugs) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

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
  console.log(`[${TALLY_SOURCE.proposalEntityType}] db: loaded ${rows.length} organizations for proposal sync`);
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (options.backfill) {
    console.log("Starting Tally backfill (full historical proposal re-scan for all orgs)...");
    const dbProposalsBefore = await getDbProposalCount();
    console.log(`[tally] DB before: ${dbProposalsBefore} proposals`);

    await runSync(db, TALLY_BACKFILL_ENTITY, runTallyBackfill);

    const dbProposalsAfter = await getDbProposalCount();
    console.log(
      `[tally] DB after: ${dbProposalsAfter} proposals (${dbProposalsAfter >= dbProposalsBefore ? "+" : ""}${dbProposalsAfter - dbProposalsBefore})`
    );
    await refreshPlatformStatsAfterSync(databaseUrl!);
    console.log("Tally backfill completed.");
    return;
  }

  console.log("Starting Tally sync...");

  const dbOrgsBefore = await getDbOrgCount();
  const dbProposalsBefore = await getDbProposalCount();
  console.log(`[tally] DB before: ${dbOrgsBefore} orgs, ${dbProposalsBefore} proposals`);

  if (!options.proposalsOnly) {
    await runSync(db, TALLY_SOURCE.spaceEntityType, syncOrganizations);
  }

  if (!options.organizationsOnly) {
    await runSync(db, TALLY_SOURCE.proposalEntityType, syncProposals);
  }

  const dbOrgsAfter = await getDbOrgCount();
  const dbProposalsAfter = await getDbProposalCount();
  console.log(
    `[tally] DB after:  ${dbOrgsAfter} orgs (${dbOrgsAfter >= dbOrgsBefore ? "+" : ""}${dbOrgsAfter - dbOrgsBefore}), ` +
      `${dbProposalsAfter} proposals (${dbProposalsAfter >= dbProposalsBefore ? "+" : ""}${dbProposalsAfter - dbProposalsBefore})`
  );

  await refreshPlatformStatsAfterSync(databaseUrl!);
  console.log("Tally sync completed.");
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function isTallyOrganization(value: TallyOrganization): value is TallyOrganization & { id: string | number } {
  return value.id !== null && value.id !== undefined && value.id !== "";
}

function isTallyProposal(value: TallyProposal): value is TallyProposal & { id: string | number } {
  return value.id !== null && value.id !== undefined && value.id !== "";
}

function matchesOrganizationFilter(organization: TallyOrganization): boolean {
  const id = String(organization.id);
  const slug = organization.slug ?? "";
  if (options.organizationIds.length > 0 && !options.organizationIds.includes(id)) return false;
  if (options.organizationSlugs.length > 0 && !options.organizationSlugs.includes(slug)) return false;
  return true;
}

function normalizeStringArray(value: Array<string | number> | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((e) => String(e)).filter(Boolean);
}

function normalizeIntegerValue(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeTimestampToUnixSeconds(value: TallyTimestampValue | null | undefined): number | null {
  const raw: string | number | null | undefined =
    value && typeof value === "object" ? value.timestamp : value;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw > 10_000_000_000 ? Math.floor(raw / 1000) : Math.floor(raw);
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 1000);
}

function getMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeGovernorIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((e) => String(e)).filter(Boolean);
}

function isUnsupportedChainTallyError(error: unknown): boolean {
  return /chain id is not supported/i.test(stringifyError(error));
}

type TallyOrganizationSyncRow = {
  id: string;
  slug: string;
  name: string;
  governorIds: string[];
};

type TallyTimestampValue =
  | TallyProposal["block"]
  | TallyProposal["start"]
  | TallyProposal["end"]
  | string
  | number;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
