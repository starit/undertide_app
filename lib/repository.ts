import { spaces as mockSpaces, proposals as mockProposals } from "@/lib/data";
import { getSql, hasDatabase } from "@/lib/db";
import { Proposal, ProposalPriority, ProposalStatus, Space } from "@/lib/types";

type SpaceRow = {
  slug: string;
  name: string;
  tagline: string;
  verified: boolean;
  followers: number;
  proposals: number;
  categories: string[];
  activity_score: number;
  website: string;
  forum: string;
  summary: string;
};

type ProposalRow = {
  id: string;
  title: string;
  protocol: string;
  space_slug: string;
  status: ProposalStatus;
  published_at: string | Date;
  closes_at: string | Date;
  heat: number;
  importance: ProposalPriority;
  summary: string;
  ai_summary: string;
  readable_content: string;
  facts: string[];
  risks: string[];
  discussion_url: string;
  proposal_url: string;
};

function mapSpace(row: SpaceRow): Space {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    verified: row.verified,
    followers: row.followers,
    proposals: row.proposals,
    categories: row.categories ?? [],
    activityScore: row.activity_score,
    website: row.website,
    forum: row.forum,
    summary: row.summary,
  };
}

function mapProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    title: row.title,
    protocol: row.protocol,
    spaceSlug: row.space_slug,
    status: row.status,
    publishedAt: new Date(row.published_at).toISOString(),
    closesAt: new Date(row.closes_at).toISOString(),
    heat: row.heat,
    importance: row.importance,
    summary: row.summary,
    aiSummary: row.ai_summary,
    readableContent: row.readable_content,
    facts: row.facts ?? [],
    risks: row.risks ?? [],
    discussionUrl: row.discussion_url,
    proposalUrl: row.proposal_url,
  };
}

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

export async function listSpaces(query: SpaceQuery = {}): Promise<Space[]> {
  if (!hasDatabase) {
    return applySpaceQuery(mockSpaces, query);
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      select slug, name, tagline, verified, followers, proposals, categories, activity_score, website, forum, summary
      from spaces
    `) as SpaceRow[];
    return applySpaceQuery(rows.map(mapSpace), query);
  } catch {
    return applySpaceQuery(mockSpaces, query);
  }
}

export async function getSpaceBySlug(slug: string): Promise<Space | null> {
  if (!hasDatabase) {
    return mockSpaces.find((space) => space.slug === slug) ?? null;
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      select slug, name, tagline, verified, followers, proposals, categories, activity_score, website, forum, summary
      from spaces
      where slug = ${slug}
      limit 1
    `) as SpaceRow[];
    return rows[0] ? mapSpace(rows[0]) : null;
  } catch {
    return mockSpaces.find((space) => space.slug === slug) ?? null;
  }
}

export async function listProposals(query: ProposalQuery = {}): Promise<Proposal[]> {
  if (!hasDatabase) {
    return applyProposalQuery(mockProposals, query);
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      select id, title, protocol, space_slug, status, published_at, closes_at, heat, importance, summary, ai_summary, readable_content, facts, risks, discussion_url, proposal_url
      from proposals
    `) as ProposalRow[];
    return applyProposalQuery(rows.map(mapProposal), query);
  } catch {
    return applyProposalQuery(mockProposals, query);
  }
}

export async function getProposalById(id: string): Promise<Proposal | null> {
  if (!hasDatabase) {
    return mockProposals.find((proposal) => proposal.id === id) ?? null;
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      select id, title, protocol, space_slug, status, published_at, closes_at, heat, importance, summary, ai_summary, readable_content, facts, risks, discussion_url, proposal_url
      from proposals
      where id = ${id}
      limit 1
    `) as ProposalRow[];
    return rows[0] ? mapProposal(rows[0]) : null;
  } catch {
    return mockProposals.find((proposal) => proposal.id === id) ?? null;
  }
}

export async function listSpaceProposals(spaceSlug: string, query: Omit<ProposalQuery, "spaceSlug"> = {}) {
  return listProposals({ ...query, spaceSlug });
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
