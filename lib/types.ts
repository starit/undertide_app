export type ProposalStatus = "Active" | "Upcoming" | "Closed" | "Executed";
export type ProposalPriority = "High Signal" | "Treasury Risk" | "Routine" | "Strategic";

export interface Proposal {
  id: string;
  title: string;
  protocol: string;
  spaceSlug: string;
  status: ProposalStatus;
  publishedAt: string;
  closesAt: string;
  heat: number;
  votesCount: number;
  type: string | null;
  importance: ProposalPriority;
  labels: string[];
  quorum: number | null;
  quorumType: string | null;
  app: string | null;
  discussion: string | null;
  summary: string;
  aiSummary: string;
  readableContent: string;
  facts: string[];
  risks: string[];
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
