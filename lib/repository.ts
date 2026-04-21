import { and, desc, eq, inArray } from "drizzle-orm";
import {
  proposalEnrichments,
  proposalTranslations,
  snapshotProposals,
  snapshotSyncRuns,
  snapshotSyncState,
  snapshotSpaces,
} from "@/db/drizzle-schema";
import { getDb, hasDatabase } from "@/lib/db";
import { Proposal, ProposalPriority, ProposalStatus, ProposalTranslation, SnapshotSyncState, Space } from "@/lib/types";

type ProposalQuery = {
  q?: string;
  status?: ProposalStatus | "All";
  sort?: "time" | "heat" | "importance";
  spaceSlug?: string;
  limit?: number;
};

type SpaceQuery = {
  q?: string;
  category?: string;
  verified?: boolean;
  sort?: "activity" | "followers";
  limit?: number;
};

type SlimSpaceRecord = Pick<
  typeof snapshotSpaces.$inferSelect,
  "id" | "name" | "about" | "network" | "admins" | "memberCount" | "proposalCount" | "strategies"
>;

type ProposalRecord = {
  proposal: typeof snapshotProposals.$inferSelect;
  space: typeof snapshotSpaces.$inferSelect;
  enrichment: typeof proposalEnrichments.$inferSelect | null;
};

type ProposalTranslationRecord = typeof proposalTranslations.$inferSelect;

type SnapshotSyncStateRecord = typeof snapshotSyncState.$inferSelect & {
  latestRun: typeof snapshotSyncRuns.$inferSelect | null;
};

export async function listSpaces(query: SpaceQuery = {}): Promise<Space[]> {
  const records = await fetchSpaces(query);
  return applySpaceQuery(records.map(mapSpace), query);
}

export async function getSpaceBySlug(slug: string): Promise<Space | null> {
  const record = await fetchSpaceBySlug(slug);
  return record ? mapSpace(record) : null;
}

export async function listProposals(query: ProposalQuery = {}): Promise<Proposal[]> {
  const records = await fetchProposals();
  return applyProposalQuery(records.map(mapProposal), query);
}

export async function getProposalById(id: string): Promise<Proposal | null> {
  const records = await fetchProposals();
  const match = records.find((record) => record.proposal.id === id);
  return match ? mapProposal(match) : null;
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
    readableContent: translation.body || proposal.readableContent,
    translation,
  };
}

export async function listSpaceProposals(spaceSlug: string, query: Omit<ProposalQuery, "spaceSlug"> = {}) {
  return listProposals({ ...query, spaceSlug });
}

export async function listSnapshotSyncStates(entityTypes?: string[]): Promise<SnapshotSyncState[]> {
  const records = await fetchSnapshotSyncStates(entityTypes);
  return records.map(mapSnapshotSyncState);
}

async function fetchSpaces(query: SpaceQuery = {}): Promise<SlimSpaceRecord[]> {
  if (!hasDatabase) {
    return [];
  }

  try {
    const db = getDb();
    const shouldLimitInSql = Boolean(query.limit) && !query.q && !query.category && typeof query.verified !== "boolean";
    const baseQuery = db
      .select({
        id: snapshotSpaces.id,
        name: snapshotSpaces.name,
        about: snapshotSpaces.about,
        network: snapshotSpaces.network,
        admins: snapshotSpaces.admins,
        memberCount: snapshotSpaces.memberCount,
        proposalCount: snapshotSpaces.proposalCount,
        strategies: snapshotSpaces.strategies,
      })
      .from(snapshotSpaces);

    if (shouldLimitInSql) {
      return await baseQuery.orderBy(desc(snapshotSpaces.proposalCount), desc(snapshotSpaces.memberCount), snapshotSpaces.name).limit(query.limit!);
    }

    return await baseQuery;
  } catch {
    return [];
  }
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
        network: snapshotSpaces.network,
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

async function fetchProposals(): Promise<ProposalRecord[]> {
  if (!hasDatabase) {
    return [];
  }

  try {
    const db = getDb();
    return await db
      .select({
        proposal: snapshotProposals,
        space: snapshotSpaces,
        enrichment: proposalEnrichments,
      })
      .from(snapshotProposals)
      .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
      .leftJoin(proposalEnrichments, eq(proposalEnrichments.proposalId, snapshotProposals.id));
  } catch {
    return [];
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
      ? runsQuery.where(inArray(snapshotSyncRuns.entityType, entityTypes)).orderBy(desc(snapshotSyncRuns.startedAt))
      : runsQuery.orderBy(desc(snapshotSyncRuns.startedAt)));

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

function mapSpace(space: SlimSpaceRecord): Space {
  const categories = deriveSpaceCategories(space);
  const summary = normalizeText(space.about) || `Governance space on ${space.network ?? "Snapshot"}.`;

  return {
    slug: space.id,
    name: space.name,
    tagline: buildTagline(summary, space.network),
    verified: Array.isArray(space.admins) && space.admins.length > 0,
    followers: space.memberCount,
    proposals: space.proposalCount,
    categories,
    activityScore: computeActivityScore(space.memberCount, space.proposalCount),
    website: getSnapshotSpaceUrl(space.id),
    forum: getSnapshotSpaceUrl(space.id),
    summary,
  };
}

function mapProposal(record: ProposalRecord): Proposal {
  const { proposal, space, enrichment } = record;
  const body = normalizeText(proposal.body) || "";
  const summary = excerpt(body, 180) || proposal.title;
  const readableContent = enrichment?.readableContent ?? body;
  const aiSummary = enrichment?.aiSummary ?? summary;
  const facts = parseStringArray(enrichment?.facts);
  const riskLabels = parseStringArray(enrichment?.riskLabels);
  const proposalUrl = getSnapshotProposalUrl(space.id, proposal.id);

  return {
    id: proposal.id,
    title: proposal.title,
    protocol: space.name,
    spaceSlug: space.id,
    status: mapProposalStatus(proposal.state),
    publishedAt: fromUnixSeconds(proposal.createdTs),
    closesAt: fromUnixSeconds(proposal.endTs),
    heat: computeProposalHeat(proposal.scoresTotal, space.memberCount),
    importance: mapImportanceLabel(enrichment?.importanceLabel, proposal.title, body),
    summary,
    aiSummary,
    readableContent,
    facts,
    risks: riskLabels,
    discussionUrl: proposalUrl,
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
          startedAt: record.latestRun.startedAt.toISOString(),
          finishedAt: record.latestRun.finishedAt?.toISOString() ?? null,
          status: record.latestRun.status,
          rowsUpserted: record.latestRun.rowsUpserted,
          error: record.latestRun.error,
        }
      : null,
  };
}

function deriveSpaceCategories(space: Pick<typeof snapshotSpaces.$inferSelect, "network" | "strategies">) {
  const categories = new Set<string>();
  categories.add("Snapshot");

  if (space.network) {
    categories.add(space.network);
  }

  const strategies = Array.isArray(space.strategies) ? space.strategies : [];
  for (const strategy of strategies) {
    if (strategy && typeof strategy === "object" && "name" in strategy && typeof strategy.name === "string") {
      categories.add(strategy.name);
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

function mapImportanceLabel(label: string | null | undefined, title: string, body: string): ProposalPriority {
  if (label === "High Signal" || label === "Treasury Risk" || label === "Routine" || label === "Strategic") {
    return label;
  }

  const content = `${title} ${body}`.toLowerCase();
  if (/(treasury|budget|grant|funding|allocation)/.test(content)) return "Treasury Risk";
  if (/(deploy|upgrade|migration|framework|launch|strategy)/.test(content)) return "Strategic";
  if (/(risk|parameter|safety|oracle|liquidation)/.test(content)) return "High Signal";
  return "Routine";
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeText(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/[#>*_`~-]/g, " ").replace(/\s+/g, " ").trim();
}

function excerpt(text: string, length: number) {
  if (!text) return "";
  return text.length <= length ? text : `${text.slice(0, length - 3).trimEnd()}...`;
}

function fromUnixSeconds(value: number) {
  return new Date(value * 1000).toISOString();
}

function getSnapshotSpaceUrl(spaceId: string) {
  return `https://snapshot.box/#/${spaceId}`;
}

function getSnapshotProposalUrl(spaceId: string, proposalId: string) {
  return `https://snapshot.box/#/${spaceId}/proposal/${proposalId}`;
}

function applyProposalQuery(items: Proposal[], query: ProposalQuery) {
  const filtered = items.filter((proposal) => {
    const q = query.q?.trim().toLowerCase();
    const matchesQuery = q
      ? [proposal.title, proposal.protocol, proposal.summary, proposal.aiSummary].join(" ").toLowerCase().includes(q)
      : true;
    const matchesStatus = query.status && query.status !== "All" ? proposal.status === query.status : true;
    const matchesSpace = query.spaceSlug ? proposal.spaceSlug === query.spaceSlug : true;
    return matchesQuery && matchesStatus && matchesSpace;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (query.sort === "heat") return b.heat - a.heat;
    if (query.sort === "importance") return b.importance.localeCompare(a.importance);
    return +new Date(b.publishedAt) - +new Date(a.publishedAt);
  });

  return typeof query.limit === "number" ? sorted.slice(0, query.limit) : sorted;
}

function applySpaceQuery(items: Space[], query: SpaceQuery) {
  const filtered = items.filter((space) => {
    const q = query.q?.trim().toLowerCase();
    const matchesQuery = q
      ? [space.name, space.summary, space.tagline, ...space.categories].join(" ").toLowerCase().includes(q)
      : true;
    const matchesCategory = query.category && query.category !== "All" ? space.categories.includes(query.category) : true;
    const matchesVerified = typeof query.verified === "boolean" ? space.verified === query.verified : true;
    return matchesQuery && matchesCategory && matchesVerified;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (query.sort === "followers") return b.followers - a.followers;
    return b.activityScore - a.activityScore;
  });

  return typeof query.limit === "number" ? sorted.slice(0, query.limit) : sorted;
}
