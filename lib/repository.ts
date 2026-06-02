import { unstable_cache } from "next/cache";
import { cache } from "react";
import { SQL, and, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import {
  proposalTranslations,
  spaceTranslations,
  platformStats,
  snapshotProposals,
  snapshotSyncRuns,
  snapshotSyncState,
  snapshotSpaces,
  tallyOrganizations,
  tallyProposals,
} from "@/db/drizzle-schema";
import { getDb, getSql, hasDatabase } from "@/lib/db";
import { GOVERNANCE_SOURCES } from "@/lib/governance/sources";
import {
  PlatformStats,
  Proposal,
  ProposalDetail,
  ProposalStatus,
  ProposalTranslation,
  SnapshotSyncState,
  Space,
  TallyOrganization,
  TallyProposal,
} from "@/lib/types";
import { PLATFORM_STATS_ROW_ID } from "@/lib/platform-stats-refresh";

/**
 * Log a database error with context.
 */
function logDbError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? `\n${error.stack.split('\n').slice(0, 3).join('\n')}` : '';
  console.error(`[DB:${context}] ${message}${stack}`);
}

type ProposalFilters = {
  q?: string;
  status?: ProposalStatus | "All";
  sort?: "time";
  spaceSlug?: string;
  limit?: number;
  locale?: string;
  translatedOnly?: boolean;
};

type NormalizedProposalFilters = {
  q?: string;
  status?: ProposalStatus | "All";
  sort: "time";
  spaceSlug?: string;
  limit?: number;
  locale?: string;
  translatedOnly: boolean;
};

type NormalizedSpaceFilters = {
  q?: string;
  category?: string;
  verified?: boolean;
  sort?: "activity" | "followers";
  limit?: number;
  locale?: string;
};

type TallyOrganizationFilters = {
  q?: string;
  hasActiveProposals?: boolean;
  limit?: number;
};

type TallyProposalFilters = {
  q?: string;
  organizationId?: string;
  organizationSlug?: string;
  status?: string;
  chainId?: string;
  limit?: number;
};

type SlimSpaceRecord = Pick<
  typeof snapshotSpaces.$inferSelect,
  | "id"
  | "name"
  | "about"
  | "avatar"
  | "network"
  | "verified"
  | "flagged"
  | "flagCode"
  | "hibernated"
  | "turbo"
  | "activeProposals"
  | "website"
  | "discussions"
  | "categories"
  | "followersCount"
  | "votesCount"
  | "twitter"
  | "github"
  | "coingecko"
  | "memberCount"
  | "proposalCount"
> & {
  translatedAbout?: string | null;
};

type ProposalRecord = {
  proposal: typeof snapshotProposals.$inferSelect;
  space: typeof snapshotSpaces.$inferSelect;
  translation: typeof proposalTranslations.$inferSelect | null;
};

type SlimProposalRecord = {
  proposal: Pick<
    typeof snapshotProposals.$inferSelect,
    | "id"
    | "spaceId"
    | "title"
    | "author"
    | "createdTs"
    | "endTs"
    | "type"
    | "labels"
    | "quorum"
    | "quorumType"
    | "app"
    | "discussion"
    | "scoresTotal"
    | "votesCount"
    | "state"
  >;
  space: Pick<typeof snapshotSpaces.$inferSelect, "id" | "name" | "avatar" | "memberCount">;
  translation: Pick<typeof proposalTranslations.$inferSelect, "title" | "summary"> | null;
};

type ProposalSearchRow = {
  proposal_id: string;
  proposal_space_id: string;
  proposal_title: string;
  proposal_author: string;
  proposal_created_ts: number | string;
  proposal_end_ts: number | string;
  proposal_type: string | null;
  proposal_labels: unknown;
  proposal_quorum: number | string | null;
  proposal_quorum_type: string | null;
  proposal_app: string | null;
  proposal_discussion: string | null;
  proposal_scores_total: number | string | null;
  proposal_votes_count: number | string;
  proposal_state: string;
  space_id: string;
  space_name: string;
  space_avatar: string | null;
  space_member_count: number | string;
  translation_title: string | null;
  translation_summary: string | null;
};

type ProposalTranslationRecord = typeof proposalTranslations.$inferSelect;

type SnapshotSyncStateRecord = typeof snapshotSyncState.$inferSelect & {
  latestRun: typeof snapshotSyncRuns.$inferSelect | null;
};

type PlatformStatsRecord = typeof platformStats.$inferSelect;

type TallyOrganizationRecord = typeof tallyOrganizations.$inferSelect;
type TallyProposalRecord = typeof tallyProposals.$inferSelect;

export async function listSpaces(query: NormalizedSpaceFilters = {}): Promise<Space[]> {
  return getCachedSpaces(normalizeSpaceFilters(query));
}

export const getSpaceBySlug = cache(async (slug: string, locale?: string): Promise<Space | null> => {
  return getCachedSpaceBySlug(slug, normalizeTranslationLocale(locale));
});

export async function listProposals(query: ProposalFilters = {}): Promise<Proposal[]> {
  const normalizedQuery = normalizeProposalFilters(query);
  const records = await getCachedProposals(normalizedQuery);
  return records.map((record) => mapProposal(record, { includeBody: false }));
}

export async function getProposalById(id: string, locale?: string): Promise<Proposal | null> {
  const record = await fetchProposalById(id, locale);
  return record ? mapProposal(record, { includeBody: true }) : null;
}

export async function getProposalTranslations(proposalId: string, locales?: string[]): Promise<ProposalTranslation[]> {
  const records = await fetchProposalTranslations(proposalId, locales);
  return records.map(mapProposalTranslation);
}

export async function getProposalTranslation(
  proposalId: string,
  locale: string
): Promise<ProposalTranslation | null> {
  const [record] = await fetchProposalTranslations(proposalId, [locale]);
  return record ? mapProposalTranslation(record) : null;
}

export async function getProposalDetail(
  id: string,
  locale?: string
): Promise<ProposalDetail | null> {
  const normalizedLocale = normalizeTranslationLocale(locale);
  const record = await fetchProposalById(id, normalizedLocale);
  const proposal = record ? mapProposal(record, { includeBody: true }) : null;
  if (!proposal || !record) return null;

  const translation = record.translation ? mapProposalTranslation(record.translation) : null;
  const choices = Array.isArray(record.proposal.choices) ? record.proposal.choices.map(String) : [];
  const scores = Array.isArray(record.proposal.scores) ? record.proposal.scores.map(Number) : null;
  const scoresTotal = record.proposal.scoresTotal != null ? Number(record.proposal.scoresTotal) : null;

  return { ...proposal, translation, choices, scores, scoresTotal };
}

export async function listSpaceProposals(spaceSlug: string, query: Omit<ProposalFilters, "spaceSlug"> = {}) {
  return listProposals({ ...query, spaceSlug });
}

export async function listSnapshotSyncStates(entityTypes?: string[]): Promise<SnapshotSyncState[]> {
  const records = await fetchSnapshotSyncStates(entityTypes);
  return records.map(mapSnapshotSyncState);
}

export async function listTallySyncStates(entityTypes?: string[]): Promise<SnapshotSyncState[]> {
  const normalizedEntityTypes =
    entityTypes && entityTypes.length > 0
      ? entityTypes.map(normalizeTallySyncEntityType)
      : [GOVERNANCE_SOURCES.tally.spaceEntityType, GOVERNANCE_SOURCES.tally.proposalEntityType];

  return listSnapshotSyncStates(normalizedEntityTypes);
}

export async function listTallyOrganizations(query: TallyOrganizationFilters = {}): Promise<TallyOrganization[]> {
  const records = await fetchTallyOrganizations(query);
  return records.map(mapTallyOrganization);
}

export async function getTallyOrganization(idOrSlug: string): Promise<TallyOrganization | null> {
  const record = await fetchTallyOrganization(idOrSlug);
  return record ? mapTallyOrganization(record) : null;
}

export async function listTallyProposals(query: TallyProposalFilters = {}): Promise<TallyProposal[]> {
  const records = await fetchTallyProposals(query);
  return records.map(mapTallyProposal);
}

export async function listTallyOrganizationProposals(
  idOrSlug: string,
  query: Omit<TallyProposalFilters, "organizationId" | "organizationSlug"> = {}
): Promise<TallyProposal[]> {
  const organization = await fetchTallyOrganization(idOrSlug);
  if (!organization) return [];

  return listTallyProposals({
    ...query,
    organizationId: organization.id,
  });
}

export async function getTallyProposal(id: string): Promise<TallyProposal | null> {
  const record = await fetchTallyProposal(id);
  return record ? mapTallyProposal(record) : null;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  return getCachedPlatformStats();
}

const SPACE_LIST_REVALIDATE_SECONDS = 120;
const SPACE_DETAIL_REVALIDATE_SECONDS = 300;
const PROPOSAL_LIST_REVALIDATE_SECONDS = 60;
const PLATFORM_STATS_REVALIDATE_SECONDS = 120;

const getCachedSpaces = unstable_cache(
  async (query: NormalizedSpaceFilters) => {
    const records = await fetchSpaces(query);
    return applySpaceFilters(records.map(mapSpace), query);
  },
  ["spaces-list"],
  {
    revalidate: SPACE_LIST_REVALIDATE_SECONDS,
    tags: ["spaces", "translations"],
  }
);

const getCachedSpaceBySlug = unstable_cache(
  async (slug: string, locale?: string) => {
    const record = await fetchSpaceBySlug(slug, locale);
    return record ? mapSpace(record) : null;
  },
  ["space-detail"],
  {
    revalidate: SPACE_DETAIL_REVALIDATE_SECONDS,
    tags: ["spaces", "translations"],
  }
);

const getCachedProposals = unstable_cache(
  async (query: NormalizedProposalFilters) => fetchProposals(query),
  ["proposals-list"],
  {
    revalidate: PROPOSAL_LIST_REVALIDATE_SECONDS,
    tags: ["proposals", "spaces", "translations"],
  }
);

const getCachedPlatformStats = unstable_cache(
  async () => fetchPlatformStats(),
  ["platform-stats"],
  {
    revalidate: PLATFORM_STATS_REVALIDATE_SECONDS,
    tags: ["spaces", "proposals", "translations", "sync"],
  }
);

const SPACE_SELECT_FIELDS = {
  id: snapshotSpaces.id,
  name: snapshotSpaces.name,
  about: snapshotSpaces.about,
  avatar: snapshotSpaces.avatar,
  network: snapshotSpaces.network,
  verified: snapshotSpaces.verified,
  flagged: snapshotSpaces.flagged,
  flagCode: snapshotSpaces.flagCode,
  hibernated: snapshotSpaces.hibernated,
  turbo: snapshotSpaces.turbo,
  activeProposals: snapshotSpaces.activeProposals,
  website: snapshotSpaces.website,
  discussions: snapshotSpaces.discussions,
  categories: snapshotSpaces.categories,
  followersCount: snapshotSpaces.followersCount,
  votesCount: snapshotSpaces.votesCount,
  twitter: snapshotSpaces.twitter,
  github: snapshotSpaces.github,
  coingecko: snapshotSpaces.coingecko,
  memberCount: snapshotSpaces.memberCount,
  proposalCount: snapshotSpaces.proposalCount,
} as const;

async function fetchSpaces(query: NormalizedSpaceFilters): Promise<SlimSpaceRecord[]> {
  if (!hasDatabase) return [];

  try {
    const db = getDb();
    const locale = query.locale && query.locale !== "en" ? query.locale : null;

    const categoryJson = query.category && query.category !== "All" ? JSON.stringify([query.category]) : undefined;
    const conditions: (SQL | undefined)[] = [
      eq(snapshotSpaces.flagged, false),
      typeof query.verified === "boolean"
        ? eq(snapshotSpaces.verified, query.verified)
        : undefined,
      query.q ? ilike(snapshotSpaces.name, `%${query.q.trim()}%`) : undefined,
      categoryJson ? sql`${snapshotSpaces.categories} @> ${categoryJson}::jsonb` : undefined,
    ];

    const orderBy = query.sort === "followers"
      ? [desc(snapshotSpaces.memberCount), snapshotSpaces.name] as const
      : [desc(snapshotSpaces.proposalCount), desc(snapshotSpaces.memberCount), snapshotSpaces.name] as const;

    const limit = query.limit ?? 2000;

    let result: SlimSpaceRecord[];

    if (locale) {
      result = await db
        .select({ ...SPACE_SELECT_FIELDS, translatedAbout: spaceTranslations.about })
        .from(snapshotSpaces)
        .leftJoin(
          spaceTranslations,
          and(eq(spaceTranslations.spaceId, snapshotSpaces.id), eq(spaceTranslations.locale, locale))
        )
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit);
    } else {
      result = await db
        .select(SPACE_SELECT_FIELDS)
        .from(snapshotSpaces)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit);
    }

    return result;
  } catch (e) {
    logDbError("fetchSpaces", e);
    return [];
  }
}

function normalizeSpaceFilters(query: NormalizedSpaceFilters = {}): NormalizedSpaceFilters {
  return {
    q: normalizeOptionalString(query.q),
    category: normalizeOptionalString(query.category),
    verified: typeof query.verified === "boolean" ? query.verified : undefined,
    sort: query.sort === "followers" ? "followers" : "activity",
    limit: normalizeLimit(query.limit, 200),
    locale: normalizeTranslationLocale(query.locale),
  };
}

function normalizeProposalFilters(query: ProposalFilters = {}): NormalizedProposalFilters {
  const status =
    query.status === "Active" ||
    query.status === "Upcoming" ||
    query.status === "Closed" ||
    query.status === "Executed" ||
    query.status === "All"
      ? query.status
      : undefined;

  return {
    q: normalizeOptionalString(query.q),
    status,
    sort: "time",
    spaceSlug: normalizeOptionalString(query.spaceSlug),
    limit: typeof query.limit === "number" ? normalizeLimit(query.limit, 200) : undefined,
    locale: normalizeTranslationLocale(query.locale),
    translatedOnly: query.translatedOnly === true,
  };
}

async function fetchSpaceBySlug(slug: string, locale?: string): Promise<SlimSpaceRecord | null> {
  if (!hasDatabase) return null;

  try {
    const db = getDb();
    const normalizedLocale = locale && locale !== "en" ? locale : null;

    if (normalizedLocale) {
      const [match] = await db
        .select({ ...SPACE_SELECT_FIELDS, translatedAbout: spaceTranslations.about })
        .from(snapshotSpaces)
        .leftJoin(
          spaceTranslations,
          and(eq(spaceTranslations.spaceId, snapshotSpaces.id), eq(spaceTranslations.locale, normalizedLocale))
        )
        .where(eq(snapshotSpaces.id, slug))
        .limit(1);
      return match ?? null;
    }

    const [match] = await db
      .select(SPACE_SELECT_FIELDS)
      .from(snapshotSpaces)
      .where(eq(snapshotSpaces.id, slug))
      .limit(1);
    return match ?? null;
  } catch (e) {
    logDbError("fetchSpaceBySlug", e);
    return null;
  }
}

/**
 * In-memory cache for fetchProposals: 64 entries, 60s TTL.
 * Complements unstable_cache on API routes.
 */
async function fetchProposals(query: NormalizedProposalFilters): Promise<SlimProposalRecord[]> {
  if (!hasDatabase) return [];

  try {
    if (query.q) {
      return await fetchSearchedProposals(query);
    }

    const db = getDb();

    const conditions: (SQL | undefined)[] = [
      eq(snapshotProposals.flagged, false),
      eq(snapshotSpaces.flagged, false),
      query.spaceSlug ? eq(snapshotProposals.spaceId, query.spaceSlug) : undefined,
      query.status && query.status !== "All"
        ? query.status === "Executed"
          ? notInArray(snapshotProposals.state, ["active", "pending", "closed"])
          : eq(snapshotProposals.state, { Active: "active", Upcoming: "pending", Closed: "closed" }[query.status]!)
        : undefined,
    ];

    const normalizedLocale = normalizeTranslationLocale(query.locale);
    const baseQuery =
      normalizedLocale && normalizedLocale !== "en"
        ? query.translatedOnly
          ? db
              .select({
                proposal: {
                  id: snapshotProposals.id,
                  spaceId: snapshotProposals.spaceId,
                  title: snapshotProposals.title,
                  author: snapshotProposals.author,
                  createdTs: snapshotProposals.createdTs,
                  endTs: snapshotProposals.endTs,
                  type: snapshotProposals.type,
                  labels: snapshotProposals.labels,
                  quorum: snapshotProposals.quorum,
                  quorumType: snapshotProposals.quorumType,
                  app: snapshotProposals.app,
                  discussion: snapshotProposals.discussion,
                  scoresTotal: snapshotProposals.scoresTotal,
                  votesCount: snapshotProposals.votesCount,
                  state: snapshotProposals.state,
                },
                space: {
                  id: snapshotSpaces.id,
                  name: snapshotSpaces.name,
                  avatar: snapshotSpaces.avatar,
                  memberCount: snapshotSpaces.memberCount,
                },
                translation: {
                  title: proposalTranslations.title,
                  summary: proposalTranslations.summary,
                },
              })
              .from(snapshotProposals)
              .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
              .innerJoin(
                proposalTranslations,
                and(
                  eq(proposalTranslations.proposalId, snapshotProposals.id),
                  eq(proposalTranslations.locale, normalizedLocale)
                )
              )
              .where(and(...conditions))
          : db
              .select({
                proposal: {
                  id: snapshotProposals.id,
                  spaceId: snapshotProposals.spaceId,
                  title: snapshotProposals.title,
                  author: snapshotProposals.author,
                  createdTs: snapshotProposals.createdTs,
                  endTs: snapshotProposals.endTs,
                  type: snapshotProposals.type,
                  labels: snapshotProposals.labels,
                  quorum: snapshotProposals.quorum,
                  quorumType: snapshotProposals.quorumType,
                  app: snapshotProposals.app,
                  discussion: snapshotProposals.discussion,
                  scoresTotal: snapshotProposals.scoresTotal,
                  votesCount: snapshotProposals.votesCount,
                  state: snapshotProposals.state,
                },
                space: {
                  id: snapshotSpaces.id,
                  name: snapshotSpaces.name,
                  avatar: snapshotSpaces.avatar,
                  memberCount: snapshotSpaces.memberCount,
                },
                translation: {
                  title: proposalTranslations.title,
                  summary: proposalTranslations.summary,
                },
              })
              .from(snapshotProposals)
              .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
              .leftJoin(
                proposalTranslations,
                and(
                  eq(proposalTranslations.proposalId, snapshotProposals.id),
                  eq(proposalTranslations.locale, normalizedLocale)
                )
              )
              .where(and(...conditions))
        : db
            .select({
              proposal: {
                id: snapshotProposals.id,
                spaceId: snapshotProposals.spaceId,
                title: snapshotProposals.title,
                author: snapshotProposals.author,
                createdTs: snapshotProposals.createdTs,
                endTs: snapshotProposals.endTs,
                type: snapshotProposals.type,
                labels: snapshotProposals.labels,
                quorum: snapshotProposals.quorum,
                quorumType: snapshotProposals.quorumType,
                app: snapshotProposals.app,
                discussion: snapshotProposals.discussion,
                scoresTotal: snapshotProposals.scoresTotal,
                votesCount: snapshotProposals.votesCount,
                state: snapshotProposals.state,
              },
              space: {
                id: snapshotSpaces.id,
                name: snapshotSpaces.name,
                avatar: snapshotSpaces.avatar,
                memberCount: snapshotSpaces.memberCount,
              },
              translation: sql<null>`null`,
            })
            .from(snapshotProposals)
            .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
            .where(and(...conditions));

    const orderedQuery = baseQuery.orderBy(desc(snapshotProposals.createdAt));

    const limit = typeof query.limit === "number" ? normalizeLimit(query.limit, 200) : undefined;
    let result: SlimProposalRecord[];
    if (limit) {
      result = await orderedQuery.limit(limit);
    } else {
      result = await orderedQuery;
    }

    return result;
  } catch (e) {
    logDbError("fetchProposals", e);
    return [];
  }
}

async function fetchSearchedProposals(query: NormalizedProposalFilters): Promise<SlimProposalRecord[]> {
  const searchTerm = normalizeOptionalString(query.q);
  if (!searchTerm) return [];

  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const patternParam = addParam(`%${searchTerm}%`);
  const candidateLimitParam = addParam(getProposalSearchCandidateLimit(query.limit));
  const spaceCandidateLimitParam = addParam(100);
  const limitParam = addParam(normalizeLimit(query.limit, 200));

  const spaceMatchConditions = [`s.flagged = false`, `s.name ilike ${patternParam}`];
  if (query.spaceSlug) {
    spaceMatchConditions.push(`s.id = ${addParam(query.spaceSlug)}`);
  }

  const titleMatchConditions = [`p.flagged = false`, `p.title ilike ${patternParam}`];
  appendProposalSearchScopeConditions(titleMatchConditions, query, "p", addParam);

  const spaceProposalConditions = [`p.flagged = false`, `p.space_id in (select id from search_space_matches)`];
  appendProposalSearchScopeConditions(spaceProposalConditions, query, "p", addParam);

  const finalConditions = [`p.flagged = false`, `s.flagged = false`];
  appendProposalSearchScopeConditions(finalConditions, query, "p", addParam);

  const normalizedLocale = normalizeTranslationLocale(query.locale);
  const shouldJoinTranslations = normalizedLocale && normalizedLocale !== "en";
  const translationLocaleParam = shouldJoinTranslations ? addParam(normalizedLocale) : null;
  const translationJoin = shouldJoinTranslations
    ? `${query.translatedOnly ? "inner" : "left"} join proposal_translations t on t.proposal_id = p.id and t.locale = ${translationLocaleParam}`
    : "";
  const translationSelect = shouldJoinTranslations
    ? `t.title as translation_title, t.summary as translation_summary`
    : `null::text as translation_title, null::text as translation_summary`;

  const searchSql = `
    with
      search_space_matches as (
        select s.id
        from snapshot_spaces s
        where ${spaceMatchConditions.join(" and ")}
        limit ${spaceCandidateLimitParam}
      ),
      title_matches as (
        select p.id
        from snapshot_proposals p
        where ${titleMatchConditions.join(" and ")}
        limit ${candidateLimitParam}
      ),
      space_proposal_matches as (
        select p.id
        from snapshot_proposals p
        where ${spaceProposalConditions.join(" and ")}
        limit ${candidateLimitParam}
      ),
      candidate_ids as (
        select id from title_matches
        union
        select id from space_proposal_matches
      )
    select
      p.id as proposal_id,
      p.space_id as proposal_space_id,
      p.title as proposal_title,
      p.author as proposal_author,
      p.created_ts as proposal_created_ts,
      p.end_ts as proposal_end_ts,
      p.type as proposal_type,
      p.labels as proposal_labels,
      p.quorum as proposal_quorum,
      p.quorum_type as proposal_quorum_type,
      p.app as proposal_app,
      p.discussion as proposal_discussion,
      p.scores_total as proposal_scores_total,
      p.votes_count as proposal_votes_count,
      p.state as proposal_state,
      s.id as space_id,
      s.name as space_name,
      s.avatar as space_avatar,
      s.member_count as space_member_count,
      ${translationSelect}
    from snapshot_proposals p
    join candidate_ids c on c.id = p.id
    join snapshot_spaces s on p.space_id = s.id
    ${translationJoin}
    where ${finalConditions.join(" and ")}
    order by p.created_at desc nulls last
    limit ${limitParam}
  `;

  const rows = (await getSql().query(searchSql, params)) as ProposalSearchRow[];
  return rows.map(mapProposalSearchRow);
}

function appendProposalSearchScopeConditions(
  conditions: string[],
  query: NormalizedProposalFilters,
  alias: string,
  addParam: (value: unknown) => string
) {
  if (query.spaceSlug) {
    conditions.push(`${alias}.space_id = ${addParam(query.spaceSlug)}`);
  }

  if (!query.status || query.status === "All") {
    return;
  }

  if (query.status === "Executed") {
    conditions.push(`${alias}.state not in ('active', 'pending', 'closed')`);
    return;
  }

  const stateByStatus = {
    Active: "active",
    Upcoming: "pending",
    Closed: "closed",
  } satisfies Record<Exclude<ProposalStatus, "Executed">, string>;

  conditions.push(`${alias}.state = ${addParam(stateByStatus[query.status])}`);
}

function getProposalSearchCandidateLimit(limit: number | undefined) {
  return Math.min(1000, Math.max(300, normalizeLimit(limit, 200) * 25));
}

function mapProposalSearchRow(row: ProposalSearchRow): SlimProposalRecord {
  const translation =
    row.translation_title || row.translation_summary
      ? {
          title: row.translation_title,
          summary: row.translation_summary,
        }
      : null;

  return {
    proposal: {
      id: row.proposal_id,
      spaceId: row.proposal_space_id,
      title: row.proposal_title,
      author: row.proposal_author,
      createdTs: Number(row.proposal_created_ts) || 0,
      endTs: Number(row.proposal_end_ts) || 0,
      type: row.proposal_type,
      labels: Array.isArray(row.proposal_labels) ? row.proposal_labels.filter((entry): entry is string => typeof entry === "string") : [],
      quorum: row.proposal_quorum == null ? null : String(row.proposal_quorum),
      quorumType: row.proposal_quorum_type,
      app: row.proposal_app,
      discussion: row.proposal_discussion,
      scoresTotal: row.proposal_scores_total == null ? null : String(row.proposal_scores_total),
      votesCount: Number(row.proposal_votes_count) || 0,
      state: row.proposal_state,
    },
    space: {
      id: row.space_id,
      name: row.space_name,
      avatar: row.space_avatar,
      memberCount: Number(row.space_member_count) || 0,
    },
    translation,
  };
}

async function fetchProposalById(id: string, locale?: string): Promise<ProposalRecord | null> {
  if (!hasDatabase) return null;

  try {
    const db = getDb();
    const normalizedLocale = normalizeTranslationLocale(locale);
    const [record] =
      normalizedLocale && normalizedLocale !== "en"
        ? await db
            .select({ proposal: snapshotProposals, space: snapshotSpaces, translation: proposalTranslations })
            .from(snapshotProposals)
            .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
            .leftJoin(
              proposalTranslations,
              and(
                eq(proposalTranslations.proposalId, snapshotProposals.id),
                eq(proposalTranslations.locale, normalizedLocale)
              )
            )
            .where(eq(snapshotProposals.id, id))
            .limit(1)
        : await db
            .select({
              proposal: snapshotProposals,
              space: snapshotSpaces,
              translation: sql<null>`null`,
            })
            .from(snapshotProposals)
            .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
            .where(eq(snapshotProposals.id, id))
            .limit(1);
    return record ?? null;
  } catch (e) {
    logDbError("fetchProposalById", e);
    return null;
  }
}

async function fetchProposalTranslations(
  proposalId: string,
  locales?: string[]
): Promise<ProposalTranslationRecord[]> {
  if (!hasDatabase) {
    return [];
  }

  try {
    const db = getDb();
    const condition =
      locales && locales.length > 0
        ? and(eq(proposalTranslations.proposalId, proposalId), inArray(proposalTranslations.locale, locales))
        : eq(proposalTranslations.proposalId, proposalId);

    return await db
      .select()
      .from(proposalTranslations)
      .where(condition)
      .orderBy(proposalTranslations.locale);
  } catch (e) {
    return [];
  }
}

async function fetchSnapshotSyncStates(entityTypes?: string[]): Promise<SnapshotSyncStateRecord[]> {
  if (!hasDatabase) {
    return [];
  }

  try {
    const db = getDb();
    const entityFilter =
      entityTypes && entityTypes.length > 0
        ? inArray(snapshotSyncState.entityType, entityTypes)
        : undefined;

    const runsQuery = db
      .selectDistinctOn([snapshotSyncRuns.entityType])
      .from(snapshotSyncRuns)
      .orderBy(snapshotSyncRuns.entityType, desc(snapshotSyncRuns.createdAt));

    const [states, latestRunRows] = await Promise.all([
      entityFilter
        ? db.select().from(snapshotSyncState).where(entityFilter)
        : db.select().from(snapshotSyncState),
      entityFilter
        ? runsQuery.where(inArray(snapshotSyncRuns.entityType, entityTypes!))
        : runsQuery,
    ]);

    const latestRuns = new Map(latestRunRows.map((r) => [r.entityType, r]));

    return states.map((state) => ({
      ...state,
      latestRun: latestRuns.get(state.entityType) ?? null,
    }));
  } catch (e) {
    return [];
  }
}

async function fetchTallyOrganizations(query: TallyOrganizationFilters = {}): Promise<TallyOrganizationRecord[]> {
  if (!hasDatabase) return [];

  try {
    const db = getDb();
    const conditions: SQL[] = [];
    const normalizedQ = normalizeOptionalString(query.q);

    if (normalizedQ) {
      conditions.push(or(ilike(tallyOrganizations.name, `%${normalizedQ}%`), ilike(tallyOrganizations.slug, `%${normalizedQ}%`))!);
    }

    if (typeof query.hasActiveProposals === "boolean") {
      conditions.push(eq(tallyOrganizations.hasActiveProposals, query.hasActiveProposals));
    }

    const baseQuery = db.select().from(tallyOrganizations);
    const ordered =
      conditions.length > 0
        ? baseQuery.where(and(...conditions)).orderBy(desc(tallyOrganizations.hasActiveProposals), desc(tallyOrganizations.proposalsCount), tallyOrganizations.name)
        : baseQuery.orderBy(desc(tallyOrganizations.hasActiveProposals), desc(tallyOrganizations.proposalsCount), tallyOrganizations.name);

    return await ordered.limit(normalizeLimit(query.limit, 100));
  } catch (e) {
    return [];
  }
}

async function fetchTallyOrganization(idOrSlug: string): Promise<TallyOrganizationRecord | null> {
  if (!hasDatabase) return null;

  try {
    const db = getDb();
    const [record] = await db
      .select()
      .from(tallyOrganizations)
      .where(or(eq(tallyOrganizations.id, idOrSlug), eq(tallyOrganizations.slug, idOrSlug)))
      .limit(1);

    return record ?? null;
  } catch (e) {
    return null;
  }
}

async function fetchTallyProposals(query: TallyProposalFilters = {}): Promise<TallyProposalRecord[]> {
  if (!hasDatabase) return [];

  try {
    const db = getDb();
    const conditions: SQL[] = [];
    const normalizedQ = normalizeOptionalString(query.q);
    const normalizedStatus = normalizeOptionalString(query.status);

    if (query.organizationId) {
      conditions.push(eq(tallyProposals.organizationId, query.organizationId));
    }

    if (query.organizationSlug) {
      conditions.push(eq(tallyProposals.organizationSlug, query.organizationSlug));
    }

    if (normalizedStatus && normalizedStatus !== "All") {
      conditions.push(eq(tallyProposals.status, normalizedStatus.toLowerCase()));
    }

    if (query.chainId) {
      conditions.push(eq(tallyProposals.chainId, query.chainId));
    }

    if (normalizedQ) {
      conditions.push(
        or(
          ilike(tallyProposals.title, `%${normalizedQ}%`),
          ilike(tallyProposals.organizationName, `%${normalizedQ}%`),
          ilike(tallyProposals.description, `%${normalizedQ}%`)
        )!
      );
    }

    const baseQuery = db.select().from(tallyProposals);
    const ordered =
      conditions.length > 0
        ? baseQuery.where(and(...conditions)).orderBy(desc(tallyProposals.sourceCreatedAt), desc(tallyProposals.syncedAt))
        : baseQuery.orderBy(desc(tallyProposals.sourceCreatedAt), desc(tallyProposals.syncedAt));

    return await ordered.limit(normalizeLimit(query.limit, 100));
  } catch (e) {
    return [];
  }
}

async function fetchTallyProposal(id: string): Promise<TallyProposalRecord | null> {
  if (!hasDatabase) return null;

  try {
    const db = getDb();
    const [record] = await db
      .select()
      .from(tallyProposals)
      .where(eq(tallyProposals.id, id))
      .limit(1);

    return record ?? null;
  } catch (e) {
    return null;
  }
}

async function fetchPlatformStats(): Promise<PlatformStats> {
  if (!hasDatabase) {
    return emptyPlatformStats();
  }

  const db = getDb();

  try {
    const [record] = await db
      .select()
      .from(platformStats)
      .where(eq(platformStats.id, PLATFORM_STATS_ROW_ID))
      .limit(1);

    if (record) {
      return mapPlatformStats(record);
    }
  } catch (e) {
    // Fall through to live counts for deployments that have not run the stats migration yet.
  }

  try {
    const [
      spacesSummaryRows,
      proposalsSummaryRows,
      translationsSummaryRows,
      translationLocaleRows,
      syncStateRows,
    ] = await Promise.all([
      db
        .select({
          spacesCount: sql<number>`count(*)::int`,
          verifiedSpacesCount: sql<number>`count(*) filter (where ${snapshotSpaces.verified})::int`,
        })
        .from(snapshotSpaces),
      db
        .select({
          proposalsCount: sql<number>`count(*)::int`,
          activeProposalsCount: sql<number>`count(*) filter (where ${snapshotProposals.state} = 'active')::int`,
        })
        .from(snapshotProposals),
      db
        .select({
          translationsCount: sql<number>`count(*)::int`,
          translatedProposalsCount: sql<number>`count(distinct ${proposalTranslations.proposalId})::int`,
        })
        .from(proposalTranslations),
      db
        .select({
          locale: proposalTranslations.locale,
          count: sql<number>`count(*)::int`,
        })
        .from(proposalTranslations)
        .groupBy(proposalTranslations.locale),
      db
        .select({
          entityType: snapshotSyncState.entityType,
          lastSuccessAt: snapshotSyncState.lastSuccessAt,
        })
        .from(snapshotSyncState)
        .where(inArray(snapshotSyncState.entityType, ["spaces", "proposals"])),
    ]);

    const spacesSummary = spacesSummaryRows[0];
    const proposalsSummary = proposalsSummaryRows[0];
    const translationsSummary = translationsSummaryRows[0];

    const translationLocaleCounts = Object.fromEntries(
      translationLocaleRows.map((row) => [row.locale, row.count ?? 0])
    );

    const syncStateMap = new Map(
      syncStateRows.map((row) => [row.entityType, row.lastSuccessAt?.toISOString() ?? null] as const)
    );

    return {
      spacesCount: spacesSummary?.spacesCount ?? 0,
      verifiedSpacesCount: spacesSummary?.verifiedSpacesCount ?? 0,
      proposalsCount: proposalsSummary?.proposalsCount ?? 0,
      activeProposalsCount: proposalsSummary?.activeProposalsCount ?? 0,
      translatedProposalsCount: translationsSummary?.translatedProposalsCount ?? 0,
      translationsCount: translationsSummary?.translationsCount ?? 0,
      translationLocaleCounts,
      lastSuccessfulSpaceSyncAt: syncStateMap.get("spaces") ?? null,
      lastSuccessfulProposalSyncAt: syncStateMap.get("proposals") ?? null,
    };
  } catch (e) {
    return emptyPlatformStats();
  }
}

function mapPlatformStats(record: PlatformStatsRecord): PlatformStats {
  return {
    spacesCount: record.spacesCount,
    verifiedSpacesCount: record.verifiedSpacesCount,
    proposalsCount: record.proposalsCount,
    activeProposalsCount: record.activeProposalsCount,
    translatedProposalsCount: record.translatedProposalsCount,
    translationsCount: record.translationsCount,
    translationLocaleCounts: record.translationLocaleCounts,
    lastSuccessfulSpaceSyncAt: record.lastSuccessfulSpaceSyncAt?.toISOString() ?? null,
    lastSuccessfulProposalSyncAt: record.lastSuccessfulProposalSyncAt?.toISOString() ?? null,
  };
}

function mapSpace(space: SlimSpaceRecord): Space {
  const categories = deriveSpaceCategories(space);
  const summary =
    (space.translatedAbout ? normalizeText(space.translatedAbout) : null) ||
    normalizeText(space.about) ||
    `Governance space on ${space.network ?? "Snapshot"}.`;

  const snapshotUrl = getSnapshotSpaceUrl(space.id);

  return {
    slug: space.id,
    name: space.name,
    tagline: buildTagline(summary, space.network),
    verified: space.verified,
    flagged: space.flagged,
    hibernated: space.hibernated,
    turbo: space.turbo,
    followers: space.followersCount || space.memberCount,
    proposals: space.proposalCount,
    activeProposals: space.activeProposals,
    votes: space.votesCount || 0,
    categories,
    activityScore: computeActivityScore(space.followersCount || space.memberCount, space.proposalCount),
    website: space.website || snapshotUrl,
    forum: space.discussions || snapshotUrl,
    twitter: space.twitter ?? null,
    github: space.github ?? null,
    coingecko: space.coingecko ?? null,
    summary,
    avatar: resolveIpfsUrl(space.avatar),
  };
}

function mapProposal(
  record: Pick<ProposalRecord, "proposal" | "space" | "translation"> | SlimProposalRecord,
  options: { includeBody: boolean }
): Proposal {
  const { proposal, space } = record;
  const translatedTitle = normalizeText(record.translation?.title);
  const translatedSummary = normalizeText(record.translation?.summary);
  const rawSourceBody = "body" in proposal ? proposal.body ?? "" : "";
  const rawTranslatedBody = record.translation && "body" in record.translation ? record.translation.body ?? "" : "";
  const normalizedSourceBody = normalizeText(rawSourceBody);
  const normalizedTranslatedBody = normalizeText(rawTranslatedBody);
  const summary =
    translatedSummary || excerpt(normalizedTranslatedBody || normalizedSourceBody, 180) || translatedTitle || proposal.title;
  const proposalUrl = getSnapshotProposalUrl(space.id, proposal.id);
  const author = proposal.author.trim() || "unknown";

  return {
    id: proposal.id,
    title: translatedTitle || proposal.title,
    protocol: space.name,
    spaceSlug: space.id,
    spaceAvatar: resolveIpfsUrl(space.avatar),
    author,
    authorProfileUrl: getSnapshotProfileUrl(author),
    status: mapProposalStatus(proposal.state),
    publishedAt: fromUnixSeconds(proposal.createdTs),
    closesAt: fromUnixSeconds(proposal.endTs),
    votesCount: proposal.votesCount,
    type: proposal.type ?? null,
    labels: parseStringArray(proposal.labels),
    quorum: proposal.quorum != null ? Number(proposal.quorum) : null,
    quorumType: proposal.quorumType ?? null,
    app: proposal.app ?? null,
    discussion: proposal.discussion || null,
    flagged: "flagged" in proposal ? proposal.flagged : false,
    summary,
    body: options.includeBody ? rawTranslatedBody || ("body" in proposal ? proposal.body || null : null) : null,
    discussionUrl: proposal.discussion || proposalUrl,
    proposalUrl,
  };
}

function mapProposalTranslation(record: ProposalTranslationRecord): ProposalTranslation {
  return {
    proposalId: record.proposalId,
    locale: record.locale,
    title: record.title ?? "",
    body: record.body ?? "",
    summary: record.summary ?? "",
    translatedBy: record.translatedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapSnapshotSyncState(record: SnapshotSyncStateRecord): SnapshotSyncState {
  return {
    entityType: record.entityType,
    lastSuccessAt: record.lastSuccessAt?.toISOString() ?? null,
    lastCursor: record.lastCursor,
    lastCreatedTs: record.lastCreatedTs ?? null,
    lastError: record.lastError,
    updatedAt: record.updatedAt.toISOString(),
    latestRun: record.latestRun
      ? {
          id: record.latestRun.id,
          createdAt: record.latestRun.createdAt.toISOString(),
          finishedAt: record.latestRun.finishedAt?.toISOString() ?? null,
          updatedAt: record.latestRun.updatedAt?.toISOString() ?? null,
          status: record.latestRun.status,
          rowsUpserted: record.latestRun.rowsUpserted,
          error: record.latestRun.error,
        }
      : null,
  };
}

function mapTallyOrganization(record: TallyOrganizationRecord): TallyOrganization {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description,
    icon: resolveIpfsUrl(record.icon),
    color: record.color,
    chainIds: parseStringArray(record.chainIds),
    tokenIds: parseStringArray(record.tokenIds),
    governorIds: parseStringArray(record.governorIds),
    hasActiveProposals: record.hasActiveProposals,
    proposalsCount: record.proposalsCount,
    delegatesCount: record.delegatesCount,
    delegatesVotesCount: record.delegatesVotesCount != null ? Number(record.delegatesVotesCount) : null,
    tokenOwnersCount: record.tokenOwnersCount,
    profileUrl: getTallyOrganizationUrl(record.slug),
    syncedAt: record.syncedAt.toISOString(),
  };
}

function mapTallyProposal(record: TallyProposalRecord): TallyProposal {
  return {
    id: record.id,
    onchainId: record.onchainId,
    organizationId: record.organizationId,
    organizationSlug: record.organizationSlug,
    organizationName: record.organizationName,
    governorId: record.governorId,
    governorSlug: record.governorSlug,
    governorName: record.governorName,
    chainId: record.chainId,
    status: record.status,
    title: record.title,
    description: record.description,
    proposerAddress: record.proposerAddress,
    creatorAddress: record.creatorAddress,
    quorum: record.quorum != null ? Number(record.quorum) : null,
    startsAt: record.startAt?.toISOString() ?? null,
    endsAt: record.endAt?.toISOString() ?? null,
    sourceCreatedAt: record.sourceCreatedAt?.toISOString() ?? null,
    voteStats: record.voteStats,
    metadata: record.metadata,
    proposalUrl: getTallyProposalUrl(record.organizationSlug, record.id),
    syncedAt: record.syncedAt.toISOString(),
  };
}

function emptyPlatformStats(): PlatformStats {
  return {
    spacesCount: 0,
    verifiedSpacesCount: 0,
    proposalsCount: 0,
    activeProposalsCount: 0,
    translatedProposalsCount: 0,
    translationsCount: 0,
    translationLocaleCounts: {},
    lastSuccessfulSpaceSyncAt: null,
    lastSuccessfulProposalSyncAt: null,
  };
}

function deriveSpaceCategories(
  space: Pick<typeof snapshotSpaces.$inferSelect, "network" | "categories">
) {
  const categories = new Set<string>();
  const snapshotCategories = Array.isArray(space.categories) ? space.categories : [];

  for (const category of snapshotCategories) {
    if (typeof category === "string" && category.trim()) {
      categories.add(category.trim());
    }
  }

  if (categories.size === 0) {
    categories.add("Snapshot");

    if (space.network) {
      categories.add(space.network);
    }
  }

  return Array.from(categories).slice(0, 4);
}

function buildTagline(summary: string, network: string | null) {
  const firstSentence = summary.split(".")[0]?.trim();
  if (firstSentence) {
    return firstSentence.length > 72 ? `${firstSentence.slice(0, 69)}...` : firstSentence;
  }

  return `Governance activity on ${network ?? "Snapshot"}.`;
}

function computeActivityScore(memberCount: number, proposalCount: number) {
  return Math.max(8, Math.min(99, Math.round(Math.log10(memberCount + 10) * 20 + Math.log10(proposalCount + 1) * 18)));
}


function mapProposalStatus(state: string): ProposalStatus {
  const normalized = state.toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "pending") return "Upcoming";
  if (normalized === "closed") return "Closed";
  return "Executed";
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeText(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/[#>*_`~-]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeLimit(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(2000, Math.floor(value)));
}

function normalizeTranslationLocale(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "zh-cn" || normalized === "zh_hans" || normalized === "zh-hans") {
    return "zh";
  }
  return normalized;
}

function normalizeTallySyncEntityType(value: string) {
  if (value.startsWith("tally:")) return value;
  if (value === "organizations") return GOVERNANCE_SOURCES.tally.spaceEntityType;
  if (value === "proposals") return GOVERNANCE_SOURCES.tally.proposalEntityType;
  return `tally:${value}`;
}

function excerpt(text: string, length: number) {
  if (!text) return "";
  return text.length <= length ? text : `${text.slice(0, length - 3).trimEnd()}...`;
}

function fromUnixSeconds(value: number) {
  return new Date(value * 1000).toISOString();
}

function resolveIpfsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${url.slice(7)}`;
  return url;
}

function getSnapshotSpaceUrl(spaceId: string) {
  return `https://snapshot.box/#/${encodeURIComponent(spaceId)}`;
}

function getSnapshotProposalUrl(spaceId: string, proposalId: string) {
  return `https://snapshot.box/#/${encodeURIComponent(spaceId)}/proposal/${encodeURIComponent(proposalId)}`;
}

function getSnapshotProfileUrl(address: string) {
  return `https://snapshot.org/#/profile/${encodeURIComponent(address)}`;
}

function getTallyOrganizationUrl(slug: string) {
  return `https://www.tally.xyz/gov/${encodeURIComponent(slug)}`;
}

function getTallyProposalUrl(organizationSlug: string | null, proposalId: string) {
  if (!organizationSlug) {
    return `https://www.tally.xyz/proposals/${encodeURIComponent(proposalId)}`;
  }

  return `https://www.tally.xyz/gov/${encodeURIComponent(organizationSlug)}/proposal/${encodeURIComponent(proposalId)}`;
}


function applySpaceFilters(items: Space[], query: NormalizedSpaceFilters) {
  // verified, q, and category are all filtered in SQL; only activityScore sort needs in-memory work
  const filtered = items.filter((space) => {
    const matchesCategory = query.category && query.category !== "All" ? space.categories.includes(query.category) : true;
    return matchesCategory;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (query.sort === "followers") return b.followers - a.followers;
    return b.activityScore - a.activityScore;
  });

  return typeof query.limit === "number" ? sorted.slice(0, query.limit) : sorted;
}
