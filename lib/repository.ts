import { count, eq } from "drizzle-orm";
import {
  proposalEnrichments,
  snapshotProposals,
  snapshotSpaces,
} from "@/db/drizzle-schema";
import { getDb, hasDatabase } from "@/lib/db";
import { Proposal, ProposalPriority, ProposalStatus, Space } from "@/lib/types";

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

type SpaceRecord = typeof snapshotSpaces.$inferSelect & {
  proposalCount: number;
};

type ProposalRecord = {
  proposal: typeof snapshotProposals.$inferSelect;
  space: typeof snapshotSpaces.$inferSelect;
  enrichment: typeof proposalEnrichments.$inferSelect | null;
};

export async function listSpaces(query: SpaceQuery = {}): Promise<Space[]> {
  const records = await fetchSpaces();
  return applySpaceQuery(records.map(mapSpace), query);
}

export async function getSpaceBySlug(slug: string): Promise<Space | null> {
  const records = await fetchSpaces();
  const match = records.find((space) => space.id === slug);
  return match ? mapSpace(match) : null;
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

export async function listSpaceProposals(spaceSlug: string, query: Omit<ProposalQuery, "spaceSlug"> = {}) {
  return listProposals({ ...query, spaceSlug });
}

async function fetchSpaces(): Promise<SpaceRecord[]> {
  if (!hasDatabase) {
    return [];
  }

  try {
    const db = getDb();
    const [spaces, proposalCounts] = await Promise.all([
      db.select().from(snapshotSpaces),
      db
        .select({
          spaceId: snapshotProposals.spaceId,
          proposalCount: count(),
        })
        .from(snapshotProposals)
        .groupBy(snapshotProposals.spaceId),
    ]);

    const countsBySpaceId = new Map(proposalCounts.map((entry) => [entry.spaceId, entry.proposalCount]));

    return spaces.map((space) => ({
      ...space,
      proposalCount: countsBySpaceId.get(space.id) ?? 0,
    }));
  } catch {
    return [];
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

function mapSpace(space: SpaceRecord): Space {
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

function deriveSpaceCategories(space: typeof snapshotSpaces.$inferSelect) {
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
