import { Proposal, Space } from "@/lib/types";

export const spaces: Space[] = [
  {
    slug: "arbitrum-dao",
    name: "Arbitrum DAO",
    tagline: "Treasury, incentive programs, and chain-level policy.",
    verified: true,
    flagged: false,
    hibernated: false,
    turbo: false,
    followers: 118400,
    proposals: 482,
    activeProposals: 3,
    votes: 1823400,
    categories: ["Layer 2", "Treasury", "Grants"],
    activityScore: 95,
    website: "https://arbitrum.foundation",
    forum: "https://forum.arbitrum.foundation",
    twitter: "arbitrum",
    github: "OffchainLabs",
    coingecko: "arbitrum",
    summary: "Arbitrum DAO governs one of the largest L2 ecosystems, with treasury allocation and growth programs frequently shaping market structure.",
    avatar: null,
  },
  {
    slug: "aave-governance",
    name: "Aave Governance",
    tagline: "Risk parameter changes and protocol upgrades.",
    verified: true,
    flagged: false,
    hibernated: false,
    turbo: false,
    followers: 96400,
    proposals: 356,
    activeProposals: 2,
    votes: 1412500,
    categories: ["Lending", "Risk", "Protocol"],
    activityScore: 92,
    website: "https://aave.com",
    forum: "https://governance.aave.com",
    twitter: "aave",
    github: "aave",
    coingecko: "aave",
    summary: "Aave governance is high-signal for collateral policy, emissions, listings, and technical upgrades across deployments.",
    avatar: null,
  },
  {
    slug: "ens-dao",
    name: "ENS DAO",
    tagline: "Stewardship of identity infrastructure on Ethereum.",
    verified: true,
    flagged: false,
    hibernated: false,
    turbo: false,
    followers: 55100,
    proposals: 188,
    activeProposals: 1,
    votes: 624000,
    categories: ["Identity", "Public Goods"],
    activityScore: 76,
    website: "https://ens.domains",
    forum: "https://discuss.ens.domains",
    twitter: "ensdomains",
    github: "ensdomains",
    coingecko: "ethereum-name-service",
    summary: "ENS DAO proposals often blend protocol maintenance with ecosystem funding and long-range governance process design.",
    avatar: null,
  },
  {
    slug: "uniswap-governance",
    name: "Uniswap Governance",
    tagline: "Delegation, fee switches, deployments, and incentives.",
    verified: true,
    flagged: false,
    hibernated: false,
    turbo: false,
    followers: 143200,
    proposals: 401,
    activeProposals: 2,
    votes: 2156700,
    categories: ["DEX", "Treasury", "Deployment"],
    activityScore: 89,
    website: "https://uniswap.org",
    forum: "https://gov.uniswap.org",
    twitter: "Uniswap",
    github: "Uniswap",
    coingecko: "uniswap",
    summary: "Uniswap governance is where liquidity incentives, treasury deployment, and strategic expansion decisions converge.",
    avatar: null,
  }
];

export const proposals: Proposal[] = [
  {
    id: "arb-stip-bridge-audit",
    title: "Expand STIP Bridge Budget for Cross-Chain Security Audits",
    protocol: "Arbitrum DAO",
    spaceSlug: "arbitrum-dao",
    status: "Active",
    publishedAt: "2026-04-18T08:00:00Z",
    closesAt: "2026-04-24T08:00:00Z",
    heat: 94,
    votesCount: 312,
    type: "single-choice",
    importance: "Treasury Risk",
    labels: ["treasury", "security"],
    quorum: 100000000,
    quorumType: "balance",
    app: "snapshot",
    discussion: "https://forum.arbitrum.foundation/t/stip-bridge-audit/123",
    summary: "Seeks additional budget allocation to fund independent audits for bridge-related incentive flows and emergency controls.",
    aiSummary: "This proposal asks Arbitrum delegates to approve a larger security budget tied to bridge incentive programs. The key question is whether additional treasury spending reduces operational and reputational risk enough to justify the cost.",
    readableContent: "The proposal expands the existing STIP oversight envelope to cover third-party bridge and message verification audits. Funds would be released in tranches based on milestone completion and public disclosure of findings.",
    facts: [
      "Budget increase proposed: 3.2M ARB equivalent",
      "Covers bridge messaging layers and operational controls",
      "Milestone-based unlocks with public reporting"
    ],
    risks: [
      "Treasury outlay rises before a measurable reduction in exploit probability is proven",
      "Audit scope may still leave off-chain operational dependencies uncovered"
    ],
    discussionUrl: "https://forum.arbitrum.foundation/t/stip-bridge-audit/123",
    proposalUrl: "https://snapshot.box"
  },
  {
    id: "aave-emode-refresh",
    title: "Refresh E-Mode Parameters for LST Collateral Markets",
    protocol: "Aave Governance",
    spaceSlug: "aave-governance",
    status: "Upcoming",
    publishedAt: "2026-04-19T12:00:00Z",
    closesAt: "2026-04-27T12:00:00Z",
    heat: 88,
    votesCount: 198,
    type: "basic",
    importance: "High Signal",
    labels: ["risk", "parameters"],
    quorum: 320000,
    quorumType: "balance",
    app: "snapshot",
    discussion: "https://governance.aave.com/t/emode-refresh/456",
    summary: "Revises liquidation thresholds and borrow caps for liquid staking token corridors to reflect current volatility and liquidity depth.",
    aiSummary: "Aave is updating risk parameters for LST pairs. Delegates should focus on insolvency protection, liquidity assumptions, and whether tighter parameters meaningfully reduce reflexive unwind risk.",
    readableContent: "Governance contributors propose updated E-Mode constraints after observing tighter market correlations and improved liquidity fragmentation across venues. The change is framed as a preventive risk action rather than a growth initiative.",
    facts: [
      "Applies to selected LST/LST and LST/ETH markets",
      "Adjusts liquidation thresholds and borrow caps",
      "Risk service providers support a staged rollout"
    ],
    risks: [
      "Over-tightening could lower capital efficiency and reduce user retention",
      "A market stress event may still exceed modeled assumptions"
    ],
    discussionUrl: "https://governance.aave.com/t/emode-refresh/456",
    proposalUrl: "https://snapshot.box"
  },
  {
    id: "ens-metagov-charter",
    title: "Ratify Meta-Governance Charter for Public Goods Allocations",
    protocol: "ENS DAO",
    spaceSlug: "ens-dao",
    status: "Closed",
    publishedAt: "2026-04-10T09:00:00Z",
    closesAt: "2026-04-16T09:00:00Z",
    heat: 71,
    votesCount: 84,
    type: "single-choice",
    importance: "Strategic",
    labels: ["governance", "public-goods"],
    quorum: null,
    quorumType: null,
    app: "snapshot",
    discussion: "https://discuss.ens.domains/t/metagov-charter/789",
    summary: "Defines principles and review cadence for how ENS delegates participate in cross-protocol public goods coordination.",
    aiSummary: "The proposal formalizes a framework rather than changing protocol mechanics directly. Its importance is strategic: it sets a durable precedent for how treasury-backed governance engages externally.",
    readableContent: "The charter outlines decision criteria, disclosure requirements, delegate responsibilities, and reporting expectations for meta-governance participation. It is designed to constrain discretionary grant behavior through shared process.",
    facts: [
      "Creates a quarterly review cadence",
      "Requires conflict disclosure for signatories",
      "Does not directly allocate treasury assets"
    ],
    risks: [
      "Broad principles may still leave operational ambiguity",
      "Enforcement depends on social legitimacy rather than code"
    ],
    discussionUrl: "https://discuss.ens.domains/t/metagov-charter/789",
    proposalUrl: "https://snapshot.box"
  },
  {
    id: "uni-deployment-northstar",
    title: "Northstar Deployment Framework for New Rollup Markets",
    protocol: "Uniswap Governance",
    spaceSlug: "uniswap-governance",
    status: "Executed",
    publishedAt: "2026-04-03T15:00:00Z",
    closesAt: "2026-04-11T15:00:00Z",
    heat: 83,
    votesCount: 441,
    type: "weighted",
    importance: "Strategic",
    labels: ["deployment", "framework"],
    quorum: 40000000,
    quorumType: "balance",
    app: "snapshot",
    discussion: "https://gov.uniswap.org/t/northstar-framework/321",
    summary: "Approves a framework for evaluating and sequencing Uniswap deployments across emerging rollup ecosystems.",
    aiSummary: "This is a strategic expansion vote. The proposal matters because it changes how governance decides future market entries, potentially affecting fee growth, security surface area, and BD incentives.",
    readableContent: "The framework introduces a scoring model for chain selection, including security assumptions, liquidity portability, governance overhead, and long-term partner alignment. It also standardizes sunset criteria for underperforming deployments.",
    facts: [
      "Introduces deployment scorecards and review checkpoints",
      "Adds chain-specific governance readiness criteria",
      "Executed after broad delegate alignment"
    ],
    risks: [
      "A formal framework may still be bypassed in politically urgent situations",
      "Expansion pressure could outpace governance attention"
    ],
    discussionUrl: "https://gov.uniswap.org/t/northstar-framework/321",
    proposalUrl: "https://snapshot.box"
  },
  {
    id: "arb-delegate-attestation",
    title: "Delegate Attestation Registry for Conflict Disclosure",
    protocol: "Arbitrum DAO",
    spaceSlug: "arbitrum-dao",
    status: "Active",
    publishedAt: "2026-04-17T08:00:00Z",
    closesAt: "2026-04-22T08:00:00Z",
    heat: 79,
    votesCount: 167,
    type: "single-choice",
    importance: "Routine",
    labels: ["governance"],
    quorum: null,
    quorumType: null,
    app: "snapshot",
    discussion: "https://forum.arbitrum.foundation/t/delegate-attestation/654",
    summary: "Creates a structured public registry for delegate affiliations and compensation disclosures.",
    aiSummary: "This proposal improves governance legibility rather than protocol economics. It is lower immediate risk, but meaningful for long-term trust and delegate accountability.",
    readableContent: "Delegates would self-publish key affiliations, compensation ranges, and service-provider ties into a maintained registry. The registry is meant to improve vote interpretation and media transparency.",
    facts: [
      "Standardized disclosure format",
      "Covers direct and indirect compensation",
      "Periodic refresh requirement"
    ],
    risks: [
      "Disclosures may remain incomplete without enforcement",
      "Registry maintenance could become stale"
    ],
    discussionUrl: "https://forum.arbitrum.foundation/t/delegate-attestation/654",
    proposalUrl: "https://snapshot.box"
  },
  {
    id: "aave-safety-module-review",
    title: "Commission Independent Review of Safety Module Migration",
    protocol: "Aave Governance",
    spaceSlug: "aave-governance",
    status: "Active",
    publishedAt: "2026-04-20T06:00:00Z",
    closesAt: "2026-04-28T06:00:00Z",
    heat: 97,
    votesCount: 523,
    type: "basic",
    importance: "High Signal",
    labels: ["risk", "safety-module"],
    quorum: 320000,
    quorumType: "balance",
    app: "snapshot",
    discussion: "https://governance.aave.com/t/safety-module-review/987",
    summary: "Requests an external review of the planned Safety Module migration, focusing on slashing assumptions and liquidity coordination.",
    aiSummary: "This proposal stands out because it touches the protocol backstop. Governance participants should assess whether the migration design improves resilience or simply moves complexity into new operational pathways.",
    readableContent: "The review would evaluate migration sequencing, slashing logic, token holder incentives, and operational response plans. Findings would be published before implementation authority is granted.",
    facts: [
      "Targets migration design, not final execution",
      "Requires publication of reviewer findings",
      "Touches core risk architecture"
    ],
    risks: [
      "Incomplete review scope may create false confidence",
      "Review delay could postpone other roadmap dependencies"
    ],
    discussionUrl: "https://governance.aave.com/t/safety-module-review/987",
    proposalUrl: "https://snapshot.box"
  }
];

export function getProposal(id: string) {
  return proposals.find((proposal) => proposal.id === id);
}

export function getSpace(slug: string) {
  return spaces.find((space) => space.slug === slug);
}

export function getSpaceProposals(slug: string) {
  return proposals.filter((proposal) => proposal.spaceSlug === slug);
}
