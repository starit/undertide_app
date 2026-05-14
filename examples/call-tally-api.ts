import {
  buildApiUrl,
  dataArray,
  firstString,
  getBaseUrl,
  getLimit,
  hasFlag,
  printUsage,
  readArgValue,
  requestJson,
} from "./api-example-utils";

if (hasFlag("--help")) {
  printUsage("Tally API examples", [
    "pnpm example:api:tally",
    "pnpm example:api:tally -- --base-url http://localhost:3000 --limit 3",
    "pnpm example:api:tally -- --q uniswap --status ACTIVE --chain-id eip155:1",
    "pnpm example:api:tally -- --organization uniswap --proposal-id <tallyProposalId>",
    "",
    "Calls:",
    "- GET /api/tally/sync",
    "- GET /api/tally/organizations",
    "- GET /api/tally/organizations/[idOrSlug]",
    "- GET /api/tally/organizations/[idOrSlug]/proposals",
    "- GET /api/tally/proposals",
    "- GET /api/tally/proposals/[id]",
  ]);
  process.exit(0);
}

const baseUrl = getBaseUrl();
const limit = getLimit(5);
const query = readArgValue("--q");
const status = readArgValue("--status");
const chainId = readArgValue("--chain-id");
const requestedOrganization = readArgValue("--organization");
const requestedProposalId = readArgValue("--proposal-id");

async function main() {
  await requestJson("tally.sync", buildApiUrl(baseUrl, "/api/tally/sync"));

  const organizations = await requestJson(
    "tally.organizations",
    buildApiUrl(baseUrl, "/api/tally/organizations", {
      limit,
      q: query,
    })
  );

  const firstOrganization = dataArray(organizations)[0] as Record<string, unknown> | undefined;
  const organizationIdOrSlug = requestedOrganization ?? firstString(firstOrganization?.slug, firstOrganization?.id);

  let proposalId = requestedProposalId;
  let proposalOrganizationSlug = firstString(firstOrganization?.slug);
  let proposalOrganizationId = firstString(firstOrganization?.id);

  if (organizationIdOrSlug) {
    const organizationDetail = await requestJson(
      "tally.organization.detail",
      buildApiUrl(baseUrl, `/api/tally/organizations/${encodeURIComponent(organizationIdOrSlug)}`)
    );
    const organization = organizationDetail.data as Record<string, unknown> | undefined;
    proposalOrganizationSlug = firstString(organization?.slug, proposalOrganizationSlug);
    proposalOrganizationId = firstString(organization?.id, proposalOrganizationId);

    const organizationProposals = await requestJson(
      "tally.organization.proposals",
      buildApiUrl(baseUrl, `/api/tally/organizations/${encodeURIComponent(organizationIdOrSlug)}/proposals`, {
        limit,
        status,
        chainId,
      })
    );

    const firstOrganizationProposal = dataArray(organizationProposals)[0] as Record<string, unknown> | undefined;
    proposalId = proposalId ?? firstString(firstOrganizationProposal?.id);
  } else {
    console.log("\n[tally.organization.detail] skipped: no organization returned; pass --organization <idOrSlug> to force one.");
  }

  const proposals = await requestJson(
    "tally.proposals",
    buildApiUrl(baseUrl, "/api/tally/proposals", {
      limit,
      q: query,
      organizationSlug: proposalOrganizationSlug,
      organizationId: proposalOrganizationSlug ? undefined : proposalOrganizationId,
      status,
      chainId,
    })
  );

  const firstProposal = dataArray(proposals)[0] as Record<string, unknown> | undefined;
  proposalId = proposalId ?? firstString(firstProposal?.id);

  if (proposalId) {
    await requestJson("tally.proposal.detail", buildApiUrl(baseUrl, `/api/tally/proposals/${encodeURIComponent(proposalId)}`));
  } else {
    console.log("\n[tally.proposal.detail] skipped: no proposal returned; pass --proposal-id <id> to force one.");
  }
}

void main().catch((error) => {
  console.error("[tally] failed", error);
  process.exit(1);
});
