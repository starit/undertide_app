export type ProposalStatus = "Active" | "Upcoming" | "Closed" | "Executed";

export interface Proposal {
  id: string;
  title: string;
  protocol: string;
  spaceSlug: string;
  spaceAvatar: string | null;
  author: string;
  authorProfileUrl: string;
  status: ProposalStatus;
  publishedAt: string;
  closesAt: string;
  heat: number;
  votesCount: number;
  type: string | null;
  labels: string[];
  quorum: number | null;
  quorumType: string | null;
  app: string | null;
  discussion: string | null;
  flagged: boolean;
  summary: string;
  body: string | null;
  discussionUrl: string;
  proposalUrl: string;
}

export interface ProposalTranslation {
  proposalId: string;
  locale: string;
  title: string;
  body: string;
  summary: string;
  translatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalDetail extends Proposal {
  translation: ProposalTranslation | null;
}

export interface Space {
  slug: string;
  name: string;
  tagline: string;
  verified: boolean;
  flagged: boolean;
  hibernated: boolean;
  turbo: boolean;
  followers: number;
  proposals: number;
  activeProposals: number;
  votes: number;
  categories: string[];
  activityScore: number;
  website: string;
  forum: string;
  twitter: string | null;
  github: string | null;
  coingecko: string | null;
  summary: string;
  avatar: string | null;
}

export interface SnapshotSyncState {
  entityType: string;
  lastSuccessAt: string | null;
  lastCursor: string | null;
  lastCreatedTs: number | null;
  lastError: string | null;
  updatedAt: string;
  latestRun: {
    id: number;
    createdAt: string;
    finishedAt: string | null;
    updatedAt: string | null;
    status: string;
    rowsUpserted: number;
    error: string | null;
  } | null;
}

export interface TallyOrganization {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  chainIds: string[];
  tokenIds: string[];
  governorIds: string[];
  hasActiveProposals: boolean;
  proposalsCount: number;
  delegatesCount: number;
  delegatesVotesCount: number | null;
  tokenOwnersCount: number;
  profileUrl: string;
  syncedAt: string;
}

export interface TallyProposal {
  id: string;
  onchainId: string | null;
  organizationId: string;
  organizationSlug: string | null;
  organizationName: string | null;
  governorId: string | null;
  governorSlug: string | null;
  governorName: string | null;
  chainId: string | null;
  status: string;
  title: string;
  description: string | null;
  proposerAddress: string | null;
  creatorAddress: string | null;
  quorum: number | null;
  startsAt: string | null;
  endsAt: string | null;
  sourceCreatedAt: string | null;
  voteStats: unknown[] | null;
  metadata: Record<string, unknown> | null;
  proposalUrl: string;
  syncedAt: string;
}

export interface PlatformStats {
  spacesCount: number;
  verifiedSpacesCount: number;
  proposalsCount: number;
  activeProposalsCount: number;
  translatedProposalsCount: number;
  translationsCount: number;
  translationLocaleCounts: Record<string, number>;
  lastSuccessfulSpaceSyncAt: string | null;
  lastSuccessfulProposalSyncAt: string | null;
}
