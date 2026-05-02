export const DEFAULT_TALLY_API_URL = "https://api.tally.xyz/query";

const DEFAULT_RETRY_LIMIT = 4;
const DEFAULT_RETRY_BASE_MS = 1500;

export type TallyPageInfo = {
  firstCursor: string | null;
  lastCursor: string | null;
  count: number;
};

export type TallyConnection<T> = {
  nodes: T[];
  pageInfo: TallyPageInfo;
};

export type TallyOrganization = {
  id: string | number;
  slug?: string | null;
  name?: string | null;
  chainIds?: Array<string | number> | null;
  tokenIds?: Array<string | number> | null;
  governorIds?: Array<string | number> | null;
  hasActiveProposals?: boolean | null;
  proposalsCount?: number | null;
  delegatesCount?: number | null;
  delegatesVotesCount?: string | number | null;
  tokenOwnersCount?: number | null;
  metadata?: {
    color?: string | null;
    description?: string | null;
    icon?: string | null;
  } | null;
};

export type TallyTimestampNode = {
  timestamp?: string | number | null;
};

export type TallyAccount = {
  address?: string | null;
};

export type TallyProposal = {
  id: string | number;
  onchainId?: string | number | null;
  chainId?: string | number | null;
  status?: string | null;
  quorum?: string | number | null;
  block?: TallyTimestampNode | null;
  start?: TallyTimestampNode | null;
  end?: TallyTimestampNode | null;
  governor?: {
    id?: string | number | null;
    slug?: string | null;
    name?: string | null;
  } | null;
  organization?: {
    id?: string | number | null;
    slug?: string | null;
    name?: string | null;
  } | null;
  proposer?: TallyAccount | null;
  creator?: TallyAccount | null;
  metadata?: Record<string, unknown> | null;
  voteStats?: unknown[] | null;
};

type TallyGraphQLError = {
  message: string;
};

type TallyClientOptions = {
  apiKey: string;
  apiUrl?: string;
  retryLimit?: number;
  retryBaseMs?: number;
};

type TallyOrganizationsInput = {
  filters?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  page?: {
    limit?: number;
    afterCursor?: string | null;
  };
};

type TallyOrganizationInput = {
  id?: string | number;
  slug?: string;
};

type TallyProposalsInput = {
  filters?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  page?: {
    limit?: number;
    afterCursor?: string | null;
  };
};

export function createTallyClient({
  apiKey,
  apiUrl = DEFAULT_TALLY_API_URL,
  retryLimit = DEFAULT_RETRY_LIMIT,
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
}: TallyClientOptions) {
  if (!apiKey.trim()) {
    throw new Error("TALLY_API_KEY is required.");
  }

  async function request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Api-Key": apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
          throw new Error(`Tally API request failed: ${response.status} ${response.statusText}`);
        }

        const json = (await response.json()) as { data?: T; errors?: TallyGraphQLError[] };
        if (json.errors?.length) {
          throw new Error(`Tally API error: ${json.errors.map((entry) => entry.message).join("; ")}`);
        }

        if (!json.data) {
          throw new Error("Tally API returned an empty response.");
        }

        return json.data;
      } catch (error) {
        lastError = error;
        if (attempt === retryLimit) {
          break;
        }

        await sleep(retryBaseMs * 2 ** attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  return {
    request,
    async listOrganizations(input: TallyOrganizationsInput = {}) {
      const data = await request<{ organizations: TallyConnection<TallyOrganization> }>(
        TALLY_ORGANIZATIONS_QUERY,
        { input }
      );
      return data.organizations;
    },
    async getOrganization(input: TallyOrganizationInput) {
      const data = await request<{ organization: TallyOrganization | null }>(
        TALLY_ORGANIZATION_QUERY,
        { input }
      );
      return data.organization;
    },
    async listProposals(input: TallyProposalsInput = {}) {
      const data = await request<{ proposals: TallyConnection<TallyProposal> }>(
        TALLY_PROPOSALS_QUERY,
        { input }
      );
      return data.proposals;
    },
  };
}

const TALLY_ORGANIZATION_FRAGMENT = `
  fragment TallyOrganizationFields on Organization {
    id
    slug
    name
    chainIds
    tokenIds
    governorIds
    hasActiveProposals
    proposalsCount
    delegatesCount
    delegatesVotesCount
    tokenOwnersCount
    metadata {
      color
      description
      icon
    }
  }
`;

const TALLY_ORGANIZATIONS_QUERY = `
  ${TALLY_ORGANIZATION_FRAGMENT}

  query TallyOrganizations($input: OrganizationsInput!) {
    organizations(input: $input) {
      nodes {
        ... on Organization {
          ...TallyOrganizationFields
        }
      }
      pageInfo {
        firstCursor
        lastCursor
        count
      }
    }
  }
`;

const TALLY_ORGANIZATION_QUERY = `
  ${TALLY_ORGANIZATION_FRAGMENT}

  query TallyOrganization($input: OrganizationInput!) {
    organization(input: $input) {
      ...TallyOrganizationFields
    }
  }
`;

const TALLY_PROPOSALS_QUERY = `
  query TallyProposals($input: ProposalsInput!) {
    proposals(input: $input) {
      nodes {
        ... on Proposal {
          id
          onchainId
          chainId
          status
          quorum
          block {
            timestamp
          }
          start {
            ... on Block {
              timestamp
            }
            ... on BlocklessTimestamp {
              timestamp
            }
          }
          end {
            ... on Block {
              timestamp
            }
            ... on BlocklessTimestamp {
              timestamp
            }
          }
          governor {
            id
            slug
            name
          }
          organization {
            id
            slug
            name
          }
          proposer {
            address
          }
          creator {
            address
          }
          metadata {
            title
            description
            discourseURL
            eta
            ipfsHash
            txHash
          }
          voteStats {
            type
            votesCount
            votersCount
            percent
          }
        }
      }
      pageInfo {
        firstCursor
        lastCursor
        count
      }
    }
  }
`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
