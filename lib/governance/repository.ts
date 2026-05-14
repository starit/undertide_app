import { SQL, and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  governanceProtocolSources,
  governanceProtocols,
  snapshotProposals,
  snapshotSpaces,
  tallyOrganizations,
  tallyProposals,
} from "@/db/drizzle-schema";
import { getDb, hasDatabase } from "@/lib/db";
import { makeSourceScopedId } from "@/lib/governance/sources";
import {
  excerpt,
  normalizeSnapshotStatus,
  normalizeTallyStatus,
  normalizeText,
} from "@/lib/governance/normalizers";
import {
  GovernanceListResponse,
  GovernanceProtocol,
  GovernanceProtocolSourceRef,
  GovernanceProposalListItem,
  GovernanceSourceConfidence,
  GovernanceSourceKind,
  GovernanceStatusGroup,
} from "@/lib/governance/types";
import { listSnapshotSyncStates, listTallySyncStates } from "@/lib/repository";

type ProtocolFilters = {
  q?: string;
  source?: "snapshot" | "tally" | "all";
  limit?: number;
};

type ProtocolProposalFilters = {
  q?: string;
  source?: "snapshot" | "tally" | "all";
  statusGroup?: GovernanceStatusGroup | "All";
  status?: string;
  chainId?: string;
  sort?: "time" | "heat" | "votes" | "endingSoon";
  limit?: number;
};

type ProtocolRecord = typeof governanceProtocols.$inferSelect;
type ProtocolSourceRecord = typeof governanceProtocolSources.$inferSelect;

type SnapshotProposalRecord = {
  proposal: typeof snapshotProposals.$inferSelect;
  space: Pick<typeof snapshotSpaces.$inferSelect, "id" | "name" | "avatar" | "memberCount" | "website" | "discussions">;
};

type TallyProposalRecord = {
  proposal: typeof tallyProposals.$inferSelect;
  organization: Pick<typeof tallyOrganizations.$inferSelect, "id" | "slug" | "name" | "icon"> | null;
};

export async function listGovernanceProtocols(
  query: ProtocolFilters = {}
): Promise<GovernanceListResponse<GovernanceProtocol>> {
  if (!hasDatabase) return emptyListResponse([]);

  const limit = normalizeLimit(query.limit, 50);
  const records = await fetchProtocols(query, limit);
  const protocolIds = records.map((record) => record.id);
  const sources = await fetchProtocolSources(protocolIds);
  const sourceRefsByProtocolId = groupSourceRefs(sources);

  return withSourceMeta(
    records.map((record) => mapProtocol(record, sourceRefsByProtocolId.get(record.id) ?? []))
  );
}

export async function getGovernanceProtocol(idOrSlug: string): Promise<GovernanceProtocol | null> {
  const record = await fetchProtocolByIdOrSlug(idOrSlug);
  if (!record) return null;

  const sourceRefs = await fetchProtocolSources([record.id]);
  return mapProtocol(record, sourceRefs.map(mapProtocolSourceRef));
}

export async function listGovernanceProtocolSources(
  idOrSlug: string
): Promise<{ protocol: Pick<GovernanceProtocol, "id" | "slug" | "name">; sources: GovernanceProtocolSourceRef[] } | null> {
  const record = await fetchProtocolByIdOrSlug(idOrSlug);
  if (!record) return null;

  const sources = await fetchProtocolSources([record.id]);
  return {
    protocol: {
      id: record.id,
      slug: record.slug,
      name: record.name,
    },
    sources: sources.map(mapProtocolSourceRef),
  };
}

export async function listGovernanceProtocolProposals(
  idOrSlug: string,
  query: ProtocolProposalFilters = {}
): Promise<GovernanceListResponse<GovernanceProposalListItem> | null> {
  const protocol = await getGovernanceProtocol(idOrSlug);
  if (!protocol) return null;

  const limit = normalizeLimit(query.limit, 50);
  const requestedSource = query.source && query.source !== "all" ? query.source : undefined;
  const sourceRefs = requestedSource
    ? protocol.sourceRefs.filter((ref) => ref.source === requestedSource)
    : protocol.sourceRefs;

  const [snapshotRows, tallyRows] = await Promise.all([
    !requestedSource || requestedSource === "snapshot"
      ? fetchSnapshotProtocolProposals(sourceRefs.filter((ref) => ref.source === "snapshot"), query, limit)
      : Promise.resolve([]),
    !requestedSource || requestedSource === "tally"
      ? fetchTallyProtocolProposals(sourceRefs.filter((ref) => ref.source === "tally"), query, limit)
      : Promise.resolve([]),
  ]);

  const proposals = [
    ...snapshotRows.map((row) => mapSnapshotProposal(row, protocol)),
    ...tallyRows.map((row) => mapTallyProposal(row, protocol)),
  ]
    .filter((proposal) => matchesProposalFilters(proposal, query))
    .sort((a, b) => compareProposals(a, b, query.sort))
    .slice(0, limit);

  return withSourceMeta(proposals);
}

async function fetchProtocols(query: ProtocolFilters, limit: number): Promise<ProtocolRecord[]> {
  try {
    const db = getDb();
    const normalizedQ = query.q?.trim();
    const source = query.source && query.source !== "all" ? query.source : undefined;

    if (source) {
      const conditions: (SQL | undefined)[] = [
        eq(governanceProtocolSources.source, source),
        protocolSearchCondition(normalizedQ),
      ];

      return await db
        .selectDistinct({
          id: governanceProtocols.id,
          slug: governanceProtocols.slug,
          name: governanceProtocols.name,
          aliases: governanceProtocols.aliases,
          categories: governanceProtocols.categories,
          website: governanceProtocols.website,
          avatar: governanceProtocols.avatar,
          metadata: governanceProtocols.metadata,
          createdAt: governanceProtocols.createdAt,
          updatedAt: governanceProtocols.updatedAt,
        })
        .from(governanceProtocols)
        .innerJoin(governanceProtocolSources, eq(governanceProtocols.id, governanceProtocolSources.protocolId))
        .where(and(...conditions))
        .orderBy(governanceProtocols.name)
        .limit(limit);
    }

    const conditions: (SQL | undefined)[] = [protocolSearchCondition(normalizedQ)];

    return await db
      .select()
      .from(governanceProtocols)
      .where(and(...conditions))
      .orderBy(governanceProtocols.name)
      .limit(limit);
  } catch {
    return [];
  }
}

function protocolSearchCondition(query: string | undefined): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${query}%`;

  return or(
    ilike(governanceProtocols.name, pattern),
    ilike(governanceProtocols.slug, pattern),
    sql`exists (
      select 1
      from jsonb_array_elements_text(${governanceProtocols.aliases}) as alias(value)
      where alias.value ilike ${pattern}
    )`
  );
}

async function fetchProtocolByIdOrSlug(idOrSlug: string): Promise<ProtocolRecord | null> {
  if (!hasDatabase) return null;

  try {
    const db = getDb();
    const [record] = await db
      .select()
      .from(governanceProtocols)
      .where(or(eq(governanceProtocols.id, idOrSlug), eq(governanceProtocols.slug, idOrSlug)))
      .limit(1);

    return record ?? null;
  } catch {
    return null;
  }
}

async function fetchProtocolSources(protocolIds: string[]): Promise<ProtocolSourceRecord[]> {
  if (!hasDatabase || protocolIds.length === 0) return [];

  try {
    const db = getDb();
    return await db
      .select()
      .from(governanceProtocolSources)
      .where(inArray(governanceProtocolSources.protocolId, protocolIds))
      .orderBy(governanceProtocolSources.protocolId, desc(governanceProtocolSources.isPrimary), governanceProtocolSources.source);
  } catch {
    return [];
  }
}

async function fetchSnapshotProtocolProposals(
  sourceRefs: GovernanceProtocolSourceRef[],
  query: ProtocolProposalFilters,
  limit: number
): Promise<SnapshotProposalRecord[]> {
  const spaceIds = sourceRefs.map((ref) => ref.sourceId);
  if (!hasDatabase || spaceIds.length === 0) return [];

  try {
    const db = getDb();
    const normalizedQ = query.q?.trim();
    const conditions: (SQL | undefined)[] = [
      inArray(snapshotProposals.spaceId, spaceIds),
      eq(snapshotProposals.flagged, false),
      normalizedQ
        ? or(ilike(snapshotProposals.title, `%${normalizedQ}%`), ilike(snapshotSpaces.name, `%${normalizedQ}%`))
        : undefined,
    ];

    return await db
      .select({
        proposal: snapshotProposals,
        space: {
          id: snapshotSpaces.id,
          name: snapshotSpaces.name,
          avatar: snapshotSpaces.avatar,
          memberCount: snapshotSpaces.memberCount,
          website: snapshotSpaces.website,
          discussions: snapshotSpaces.discussions,
        },
      })
      .from(snapshotProposals)
      .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
      .where(and(...conditions))
      .orderBy(desc(snapshotProposals.createdAt))
      .limit(Math.max(limit + 1, 100));
  } catch {
    return [];
  }
}

async function fetchTallyProtocolProposals(
  sourceRefs: GovernanceProtocolSourceRef[],
  query: ProtocolProposalFilters,
  limit: number
): Promise<TallyProposalRecord[]> {
  const organizationIds = sourceRefs.filter((ref) => ref.sourceKind === "tally-organization").map((ref) => ref.sourceId);
  if (!hasDatabase || organizationIds.length === 0) return [];

  try {
    const db = getDb();
    const normalizedQ = query.q?.trim();
    const conditions: (SQL | undefined)[] = [
      inArray(tallyProposals.organizationId, organizationIds),
      query.chainId ? eq(tallyProposals.chainId, query.chainId) : undefined,
      normalizedQ
        ? or(
            ilike(tallyProposals.title, `%${normalizedQ}%`),
            ilike(tallyProposals.description, `%${normalizedQ}%`),
            ilike(tallyProposals.organizationName, `%${normalizedQ}%`)
          )
        : undefined,
    ];

    return await db
      .select({
        proposal: tallyProposals,
        organization: {
          id: tallyOrganizations.id,
          slug: tallyOrganizations.slug,
          name: tallyOrganizations.name,
          icon: tallyOrganizations.icon,
        },
      })
      .from(tallyProposals)
      .leftJoin(tallyOrganizations, eq(tallyProposals.organizationId, tallyOrganizations.id))
      .where(and(...conditions))
      .orderBy(desc(tallyProposals.sourceCreatedAt), desc(tallyProposals.syncedAt))
      .limit(Math.max(limit + 1, 100));
  } catch {
    return [];
  }
}

function mapProtocol(record: ProtocolRecord, sourceRefs: GovernanceProtocolSourceRef[]): GovernanceProtocol {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    aliases: parseStringArray(record.aliases),
    categories: parseStringArray(record.categories),
    website: record.website,
    avatar: resolveIpfsUrl(record.avatar),
    sourceRefs,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapProtocolSourceRef(record: ProtocolSourceRecord): GovernanceProtocolSourceRef {
  return {
    protocolId: record.protocolId,
    source: record.source === "tally" ? "tally" : "snapshot",
    sourceId: record.sourceId,
    sourceKind: parseSourceKind(record.sourceKind),
    sourceSlug: record.sourceSlug,
    sourceName: record.sourceName,
    isPrimary: record.isPrimary,
    confidence: parseConfidence(record.confidence),
  };
}

function mapSnapshotProposal(row: SnapshotProposalRecord, protocol: GovernanceProtocol): GovernanceProposalListItem {
  const { proposal, space } = row;
  const status = normalizeSnapshotStatus(proposal.state);
  const body = proposal.body ?? null;
  const proposalUrl = getSnapshotProposalUrl(space.id, proposal.id);

  return {
    uid: makeSourceScopedId("snapshot", proposal.id),
    source: "snapshot",
    sourceId: proposal.id,
    title: proposal.title,
    body,
    summary: excerpt(body, 180) || proposal.title,
    protocol: {
      id: protocol.id,
      slug: protocol.slug,
      name: protocol.name,
    },
    sourceObject: {
      uid: makeSourceScopedId("snapshot", space.id),
      source: "snapshot",
      sourceId: space.id,
      sourceKind: "snapshot-space",
      slug: space.id,
      name: space.name,
      avatar: resolveIpfsUrl(space.avatar),
    },
    statusGroup: status.statusGroup,
    status: status.status,
    sourceStatus: proposal.state,
    outcome: status.outcome,
    author: proposal.author || null,
    publishedAt: fromUnixSeconds(proposal.createdTs),
    startsAt: fromUnixSeconds(proposal.startTs),
    endsAt: fromUnixSeconds(proposal.endTs),
    votesCount: proposal.votesCount,
    quorum: proposal.quorum != null ? String(proposal.quorum) : null,
    heat: computeProposalHeat(proposal.scoresTotal, space.memberCount),
    discussionUrl: proposal.discussion || proposalUrl,
    proposalUrl,
    sourceUrl: proposalUrl,
    labels: parseStringArray(proposal.labels),
    chainId: proposal.network,
    syncedAt: proposal.syncedAt.toISOString(),
  };
}

function mapTallyProposal(row: TallyProposalRecord, protocol: GovernanceProtocol): GovernanceProposalListItem {
  const { proposal, organization } = row;
  const status = normalizeTallyStatus(proposal.status);
  const body = proposal.description ?? null;
  const organizationSlug = organization?.slug ?? proposal.organizationSlug;
  const organizationName = organization?.name ?? proposal.organizationName;
  const sourceObjectId = proposal.organizationId;
  const proposalUrl = getTallyProposalUrl(organizationSlug, proposal.id);

  return {
    uid: makeSourceScopedId("tally", proposal.id),
    source: "tally",
    sourceId: proposal.id,
    title: proposal.title,
    body,
    summary: excerpt(body, 180) || proposal.title,
    protocol: {
      id: protocol.id,
      slug: protocol.slug,
      name: protocol.name,
    },
    sourceObject: {
      uid: makeSourceScopedId("tally", sourceObjectId),
      source: "tally",
      sourceId: sourceObjectId,
      sourceKind: "tally-organization",
      slug: organizationSlug,
      name: organizationName,
      avatar: resolveIpfsUrl(organization?.icon),
    },
    statusGroup: status.statusGroup,
    status: status.status,
    sourceStatus: proposal.status,
    outcome: status.outcome,
    author: proposal.proposerAddress ?? proposal.creatorAddress,
    publishedAt: proposal.sourceCreatedAt?.toISOString() ?? null,
    startsAt: proposal.startAt?.toISOString() ?? null,
    endsAt: proposal.endAt?.toISOString() ?? null,
    votesCount: sumTallyVotes(proposal.voteStats),
    quorum: proposal.quorum != null ? String(proposal.quorum) : null,
    heat: computeProposalHeat(proposal.quorum, sumTallyVotes(proposal.voteStats) ?? 0),
    discussionUrl: getMetadataString(proposal.metadata, "discourseURL"),
    proposalUrl,
    sourceUrl: proposalUrl,
    labels: [],
    chainId: proposal.chainId,
    syncedAt: proposal.syncedAt.toISOString(),
  };
}

function groupSourceRefs(records: ProtocolSourceRecord[]) {
  const map = new Map<string, GovernanceProtocolSourceRef[]>();
  for (const record of records) {
    const sourceRefs = map.get(record.protocolId) ?? [];
    sourceRefs.push(mapProtocolSourceRef(record));
    map.set(record.protocolId, sourceRefs);
  }
  return map;
}

function matchesProposalFilters(proposal: GovernanceProposalListItem, query: ProtocolProposalFilters) {
  if (query.statusGroup && query.statusGroup !== "All" && proposal.statusGroup !== query.statusGroup) {
    return false;
  }

  if (query.status && query.status.toLowerCase() !== proposal.status.toLowerCase()) {
    return false;
  }

  return true;
}

function compareProposals(a: GovernanceProposalListItem, b: GovernanceProposalListItem, sort: ProtocolProposalFilters["sort"]) {
  if (sort === "heat") return b.heat - a.heat;
  if (sort === "votes") return (b.votesCount ?? 0) - (a.votesCount ?? 0);
  if (sort === "endingSoon") {
    return nullableTime(a.endsAt, Number.MAX_SAFE_INTEGER) - nullableTime(b.endsAt, Number.MAX_SAFE_INTEGER);
  }
  return nullableTime(b.publishedAt, 0) - nullableTime(a.publishedAt, 0);
}

async function withSourceMeta<T>(data: T[]): Promise<GovernanceListResponse<T>> {
  const [snapshotStates, tallyStates] = await Promise.all([
    listSnapshotSyncStates(["spaces", "proposals"]),
    listTallySyncStates(["tally:organizations", "tally:proposals"]),
  ]);

  return {
    data,
    pageInfo: {
      nextCursor: null,
      hasNextPage: false,
    },
    meta: {
      sources: [
        {
          source: "snapshot",
          syncedAt: latestSuccessfulSync(snapshotStates),
          partial: false,
          error: latestSyncError(snapshotStates),
        },
        {
          source: "tally",
          syncedAt: latestSuccessfulSync(tallyStates),
          partial: false,
          error: latestSyncError(tallyStates),
        },
      ],
    },
  };
}

function emptyListResponse<T>(data: T[]): GovernanceListResponse<T> {
  return {
    data,
    pageInfo: {
      nextCursor: null,
      hasNextPage: false,
    },
    meta: {
      sources: [],
    },
  };
}

function latestSuccessfulSync(states: Array<{ lastSuccessAt: string | null }>) {
  const timestamps = states
    .map((state) => state.lastSuccessAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return timestamps.at(-1) ?? null;
}

function latestSyncError(states: Array<{ lastError: string | null }>) {
  return states.find((state) => state.lastError)?.lastError ?? null;
}

function parseSourceKind(value: string): GovernanceSourceKind {
  if (value === "tally-organization" || value === "tally-governor") return value;
  return "snapshot-space";
}

function parseConfidence(value: string): GovernanceSourceConfidence {
  if (value === "manual" || value === "high" || value === "medium") return value;
  return "low";
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeLimit(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(value)));
}

function fromUnixSeconds(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function nullableTime(value: string | null, fallback: number) {
  return value ? +new Date(value) : fallback;
}

function computeProposalHeat(scoreValue: string | null, memberOrVotesCount: number) {
  const score = scoreValue ? Number(scoreValue) : 0;
  return Math.max(10, Math.min(99, Math.round(Math.log10(score + 10) * 24 + Math.log10(memberOrVotesCount + 10) * 12)));
}

function sumTallyVotes(voteStats: unknown[] | null) {
  if (!Array.isArray(voteStats)) return null;

  let total = 0;
  for (const entry of voteStats) {
    if (!entry || typeof entry !== "object") continue;
    const votesCount = (entry as { votesCount?: unknown }).votesCount;
    const numeric = typeof votesCount === "number" ? votesCount : Number(votesCount);
    if (Number.isFinite(numeric)) total += numeric;
  }

  return total;
}

function getMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveIpfsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${url.slice(7)}`;
  return url;
}

function getSnapshotProposalUrl(spaceId: string, proposalId: string) {
  return `https://snapshot.box/#/${encodeURIComponent(spaceId)}/proposal/${encodeURIComponent(proposalId)}`;
}

function getTallyProposalUrl(organizationSlug: string | null | undefined, proposalId: string) {
  if (!organizationSlug) return `https://www.tally.xyz/proposals/${encodeURIComponent(proposalId)}`;
  return `https://www.tally.xyz/gov/${encodeURIComponent(organizationSlug)}/proposal/${encodeURIComponent(proposalId)}`;
}
