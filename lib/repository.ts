import { unstable_cache } from "next/cache";
import { SQL, and, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import {
  proposalTranslations,
  snapshotProposals,
  snapshotSyncRuns,
  snapshotSyncState,
  snapshotSpaces,
} from "@/db/drizzle-schema";
import { getDb, hasDatabase } from "@/lib/db";
import { PlatformStats, Proposal, ProposalStatus, ProposalTranslation, SnapshotSyncState, Space } from "@/lib/types";

type ProposalFilters = {
  q?: string;
  status?: ProposalStatus | "All";
  sort?: "time" | "heat";
  spaceSlug?: string;
  limit?: number;
};

type SpaceFilters = {
  q?: string;
  category?: string;
  verified?: boolean;
  sort?: "activity" | "followers";
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
  | "admins"
  | "memberCount"
  | "proposalCount"
  | "strategies"
>;

type ProposalRecord = {
  proposal: typeof snapshotProposals.$inferSelect;
  space: typeof snapshotSpaces.$inferSelect;
};

type ProposalTranslationRecord = typeof proposalTranslations.$inferSelect;

type SnapshotSyncStateRecord = typeof snapshotSyncState.$inferSelect & {
  latestRun: typeof snapshotSyncRuns.$inferSelect | null;
};

export async function listSpaces(query: SpaceFilters = {}): Promise<Space[]> {
  return getCachedSpaces(normalizeSpaceFilters(query));
}

export async function getSpaceBySlug(slug: string): Promise<Space | null> {
  return getCachedSpaceBySlug(slug);
}

export async function listProposals(query: ProposalFilters = {}): Promise<Proposal[]> {
  const records = await fetchProposals(query);
  // time sort + limit are fully handled in SQL; skip in-memory pass
  if ((!query.sort || query.sort === "time") && query.limit) {
    return records.map(mapProposal);
  }
  return applyProposalFilters(records.map(mapProposal), query);
}

export async function getProposalById(id: string): Promise<Proposal | null> {
  const record = await fetchProposalById(id);
  return record ? mapProposal(record) : null;
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
): Promise<(Proposal & { translation: ProposalTranslation | null }) | null> {
  const proposal = await getProposalById(id);
  if (!proposal) return null;

  const translation = locale ? await getProposalTranslation(id, locale) : null;
  if (!translation) {
    return { ...proposal, translation: null };
  }

  return {
    ...proposal,
    title: translation.title || proposal.title,
    summary: translation.summary || proposal.summary,
    body: translation.body || proposal.body,
    translation,
  };
}

export async function listSpaceProposals(spaceSlug: string, query: Omit<ProposalFilters, "spaceSlug"> = {}) {
  return listProposals({ ...query, spaceSlug });
}

export async function listSnapshotSyncStates(entityTypes?: string[]): Promise<SnapshotSyncState[]> {
  const records = await fetchSnapshotSyncStates(entityTypes);
  return records.map(mapSnapshotSyncState);
}

export async function getPlatformStats(): Promise<PlatformStats> {
  return getCachedPlatformStats();
}

const SPACE_LIST_REVALIDATE_SECONDS = 120;
const SPACE_DETAIL_REVALIDATE_SECONDS = 300;
const PLATFORM_STATS_REVALIDATE_SECONDS = 120;

const getCachedSpaces = unstable_cache(
  async (query: NormalizedSpaceFilters) => {
    const records = await fetchSpaces(query);
    return applySpaceFilters(records.map(mapSpace), query);
  },
  ["spaces-list"],
  {
    revalidate: SPACE_LIST_REVALIDATE_SECONDS,
    tags: ["spaces"],
  }
);

const getCachedSpaceBySlug = unstable_cache(
  async (slug: string) => {
    const record = await fetchSpaceBySlug(slug);
    return record ? mapSpace(record) : null;
  },
  ["space-detail"],
  {
    revalidate: SPACE_DETAIL_REVALIDATE_SECONDS,
    tags: ["spaces"],
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

async function fetchSpaces(query: SpaceFilters = {}): Promise<SlimSpaceRecord[]> {
  if (!hasDatabase) return [];

  try {
    const db = getDb();

    const conditions: (SQL | undefined)[] = [
      typeof query.verified === "boolean"
        ? eq(snapshotSpaces.verified, query.verified)
        : undefined,
      query.q ? ilike(snapshotSpaces.name, `%${query.q.trim()}%`) : undefined,
    ];

    const baseQuery = db
      .select({
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
        admins: snapshotSpaces.admins,
        memberCount: snapshotSpaces.memberCount,
        proposalCount: snapshotSpaces.proposalCount,
        strategies: snapshotSpaces.strategies,
      })
      .from(snapshotSpaces)
      .where(and(...conditions));

    // followers sort is fully expressible in SQL; push limit when no category post-filter needed
    if (query.sort === "followers") {
      const ordered = baseQuery.orderBy(desc(snapshotSpaces.memberCount), snapshotSpaces.name);
      return await ordered.limit(query.limit && !query.category ? query.limit : 2000);
    }

    // activity sort needs in-memory computation; pull enough rows for post-filter
    const ordered = baseQuery.orderBy(desc(snapshotSpaces.proposalCount), desc(snapshotSpaces.memberCount), snapshotSpaces.name);
    return await ordered.limit(query.limit && !query.category ? query.limit : 2000);
  } catch {
    return [];
  }
}

type NormalizedSpaceFilters = {
  q?: string;
  category?: string;
  verified?: boolean;
  sort: "activity" | "followers";
  limit: number;
};

function normalizeSpaceFilters(query: SpaceFilters = {}): NormalizedSpaceFilters {
  return {
    q: normalizeOptionalString(query.q),
    category: normalizeOptionalString(query.category),
    verified: typeof query.verified === "boolean" ? query.verified : undefined,
    sort: query.sort === "followers" ? "followers" : "activity",
    limit: normalizeLimit(query.limit, 200),
  };
}

async function fetchSpaceBySlug(slug: string): Promise<SlimSpaceRecord | null> {
  if (!hasDatabase) {
    return null;
  }

  try {
    const db = getDb();
    const space = await db
      .select({
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
        admins: snapshotSpaces.admins,
        memberCount: snapshotSpaces.memberCount,
        proposalCount: snapshotSpaces.proposalCount,
        strategies: snapshotSpaces.strategies,
      })
      .from(snapshotSpaces)
      .where(eq(snapshotSpaces.id, slug))
      .limit(1);

    const match = space[0];
    if (!match) return null;
    return match;
  } catch {
    return null;
  }
}

async function fetchProposals(query: ProposalFilters = {}): Promise<ProposalRecord[]> {
  if (!hasDatabase) return [];

  try {
    const db = getDb();

    const conditions: (SQL | undefined)[] = [
      query.spaceSlug ? eq(snapshotProposals.spaceId, query.spaceSlug) : undefined,
      query.status && query.status !== "All"
        ? query.status === "Executed"
          ? notInArray(snapshotProposals.state, ["active", "pending", "closed"])
          : eq(snapshotProposals.state, { Active: "active", Upcoming: "pending", Closed: "closed" }[query.status]!)
        : undefined,
      query.q
        ? or(ilike(snapshotProposals.title, `%${query.q.trim()}%`), ilike(snapshotSpaces.name, `%${query.q.trim()}%`))
        : undefined,
    ];

    const baseQuery = db
      .select({ proposal: snapshotProposals, space: snapshotSpaces })
      .from(snapshotProposals)
      .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
      .where(and(...conditions))
      .orderBy(desc(snapshotProposals.createdTs));

    // push LIMIT to SQL only when sort=time (default) — heat/importance need in-memory reorder
    if ((!query.sort || query.sort === "time") && query.limit) {
      return await baseQuery.limit(query.limit);
    }

    return await baseQuery;
  } catch {
    return [];
  }
}

async function fetchProposalById(id: string): Promise<ProposalRecord | null> {
  if (!hasDatabase) return null;

  try {
    const db = getDb();
    const [record] = await db
      .select({ proposal: snapshotProposals, space: snapshotSpaces })
      .from(snapshotProposals)
      .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
      .where(eq(snapshotProposals.id, id))
      .limit(1);
    return record ?? null;
  } catch {
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
  } catch {
    return [];
  }
}

async function fetchSnapshotSyncStates(entityTypes?: string[]): Promise<SnapshotSyncStateRecord[]> {
  if (!hasDatabase) {
    return [];
  }

  try {
    const db = getDb();
    const statesQuery = db.select().from(snapshotSyncState);
    const runsQuery = db.select().from(snapshotSyncRuns);

    const states = await (entityTypes && entityTypes.length > 0
      ? statesQuery.where(inArray(snapshotSyncState.entityType, entityTypes))
      : statesQuery);

    const runs = await (entityTypes && entityTypes.length > 0
      ? runsQuery.where(inArray(snapshotSyncRuns.entityType, entityTypes)).orderBy(desc(snapshotSyncRuns.createdAt))
      : runsQuery.orderBy(desc(snapshotSyncRuns.createdAt)));

    const latestRuns = new Map<string, typeof snapshotSyncRuns.$inferSelect>();
    for (const run of runs) {
      if (!latestRuns.has(run.entityType)) {
        latestRuns.set(run.entityType, run);
      }
    }

    return states.map((state) => ({
      ...state,
      latestRun: latestRuns.get(state.entityType) ?? null,
    }));
  } catch {
    return [];
  }
}

async function fetchPlatformStats(): Promise<PlatformStats> {
  if (!hasDatabase) {
    return emptyPlatformStats();
  }

  try {
    const db = getDb();

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
  } catch {
    return emptyPlatformStats();
  }
}

function mapSpace(space: SlimSpaceRecord): Space {
  const categories = deriveSpaceCategories(space);
  const summary = normalizeText(space.about) || `Governance space on ${space.network ?? "Snapshot"}.`;

  const snapshotUrl = getSnapshotSpaceUrl(space.id);

  return {
    slug: space.id,
    name: space.name,
    tagline: buildTagline(summary, space.network),
    verified: typeof space.verified === "boolean" ? space.verified : Array.isArray(space.admins) && space.admins.length > 0,
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

function mapProposal(record: ProposalRecord): Proposal {
  const { proposal, space } = record;
  const body = normalizeText(proposal.body) || "";
  const summary = excerpt(body, 180) || proposal.title;
  const proposalUrl = getSnapshotProposalUrl(space.id, proposal.id);

  return {
    id: proposal.id,
    title: proposal.title,
    protocol: space.name,
    spaceSlug: space.id,
    spaceAvatar: resolveIpfsUrl(space.avatar),
    status: mapProposalStatus(proposal.state),
    publishedAt: fromUnixSeconds(proposal.createdTs),
    closesAt: fromUnixSeconds(proposal.endTs),
    heat: computeProposalHeat(proposal.scoresTotal, space.memberCount),
    votesCount: proposal.votesCount,
    type: proposal.type ?? null,
    labels: parseStringArray(proposal.labels),
    quorum: proposal.quorum != null ? Number(proposal.quorum) : null,
    quorumType: proposal.quorumType ?? null,
    app: proposal.app ?? null,
    discussion: proposal.discussion || null,
    summary,
    body: proposal.body ?? null,
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
  space: Pick<typeof snapshotSpaces.$inferSelect, "network" | "categories" | "strategies">
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

function computeProposalHeat(scoresTotal: string | null, memberCount: number) {
  const score = scoresTotal ? Number(scoresTotal) : 0;
  return Math.max(10, Math.min(99, Math.round(Math.log10(score + 10) * 24 + Math.log10(memberCount + 10) * 12)));
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

function applyProposalFilters(items: Proposal[], query: ProposalFilters) {
  // spaceSlug, status, q are already filtered in SQL; only complex sorts need in-memory work
  const sorted = [...items].sort((a, b) => {
    if (query.sort === "heat") return b.heat - a.heat;
    return +new Date(b.publishedAt) - +new Date(a.publishedAt);
  });

  return typeof query.limit === "number" ? sorted.slice(0, query.limit) : sorted;
}

function applySpaceFilters(items: Space[], query: SpaceFilters) {
  // verified and q are already filtered in SQL; category is handled here on the smaller result set
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
