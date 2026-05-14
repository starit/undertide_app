import { GovernanceSource, SourceScopedId } from "@/lib/governance/sources";

export type GovernanceSourceKind = "snapshot-space" | "tally-organization" | "tally-governor";
export type GovernanceSourceConfidence = "manual" | "high" | "medium" | "low";
export type GovernanceStatusGroup = "Upcoming" | "Active" | "Closed" | "Executed";
export type GovernanceOutcome = "passed" | "failed" | "unknown" | null;

export type GovernanceProtocolSourceRef = {
  protocolId: string;
  source: GovernanceSource;
  sourceId: string;
  sourceKind: GovernanceSourceKind;
  sourceSlug: string | null;
  sourceName: string | null;
  isPrimary: boolean;
  confidence: GovernanceSourceConfidence;
};

export type GovernanceProtocol = {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  categories: string[];
  website: string | null;
  avatar: string | null;
  sourceRefs: GovernanceProtocolSourceRef[];
  createdAt: string;
  updatedAt: string;
};

export type GovernanceProposalListItem = {
  uid: SourceScopedId;
  source: GovernanceSource;
  sourceId: string;
  title: string;
  body: string | null;
  summary: string;
  protocol: {
    id: string | null;
    slug: string | null;
    name: string | null;
  };
  sourceObject: {
    uid: SourceScopedId;
    source: GovernanceSource;
    sourceId: string;
    sourceKind: GovernanceSourceKind;
    slug: string | null;
    name: string | null;
    avatar: string | null;
  };
  statusGroup: GovernanceStatusGroup;
  status: string;
  sourceStatus: string;
  outcome: GovernanceOutcome;
  author: string | null;
  publishedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  votesCount: number | null;
  quorum: string | null;
  heat: number;
  discussionUrl: string | null;
  proposalUrl: string;
  sourceUrl: string;
  labels: string[];
  chainId: string | null;
  syncedAt: string;
};

export type GovernanceListResponse<T> = {
  data: T[];
  pageInfo: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
  meta: {
    sources: Array<{
      source: GovernanceSource;
      syncedAt: string | null;
      partial: boolean;
      error: string | null;
    }>;
  };
};
