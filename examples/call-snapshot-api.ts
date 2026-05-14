import {
  buildApiUrl,
  dataArray,
  dataObject,
  firstString,
  getBaseUrl,
  getLimit,
  hasFlag,
  printUsage,
  readArgValue,
  requestJson,
} from "./api-example-utils";

if (hasFlag("--help")) {
  printUsage("Snapshot API examples", [
    "pnpm example:api:snapshot",
    "pnpm example:api:snapshot -- --base-url http://localhost:3000 --limit 3",
    "pnpm example:api:snapshot -- --q arbitrum --locale zh",
    "pnpm example:api:snapshot -- --space aave.eth --proposal-id <snapshotProposalId>",
    "",
    "Calls:",
    "- GET /api/snapshot/sync",
    "- GET /api/snapshot/spaces",
    "- GET /api/snapshot/spaces/[slug]",
    "- GET /api/snapshot/spaces/[slug]/proposals",
    "- GET /api/snapshot/proposals",
    "- GET /api/snapshot/proposals/[id]",
    "- GET /api/snapshot/proposals/[id]/translations",
  ]);
  process.exit(0);
}

const baseUrl = getBaseUrl();
const limit = getLimit(5);
const query = readArgValue("--q");
const locale = readArgValue("--locale") ?? "zh";
const requestedSpace = readArgValue("--space");
const requestedProposalId = readArgValue("--proposal-id");

async function main() {
  await requestJson("snapshot.sync", buildApiUrl(baseUrl, "/api/snapshot/sync"));

  const spaces = await requestJson(
    "snapshot.spaces",
    buildApiUrl(baseUrl, "/api/snapshot/spaces", {
      limit,
      sort: "activity",
      q: query,
    })
  );

  const firstSpace = dataArray(spaces)[0] as Record<string, unknown> | undefined;
  const spaceSlug = requestedSpace ?? firstString(firstSpace?.slug, firstSpace?.id);

  if (spaceSlug) {
    await requestJson("snapshot.space.detail", buildApiUrl(baseUrl, `/api/snapshot/spaces/${encodeURIComponent(spaceSlug)}`));
    await requestJson(
      "snapshot.space.proposals",
      buildApiUrl(baseUrl, `/api/snapshot/spaces/${encodeURIComponent(spaceSlug)}/proposals`, {
        limit,
        status: "All",
        sort: "time",
        locale,
      })
    );
  } else {
    console.log("\n[snapshot.space.detail] skipped: no space returned; pass --space <slug> to force one.");
  }

  const proposals = await requestJson(
    "snapshot.proposals",
    buildApiUrl(baseUrl, "/api/snapshot/proposals", {
      limit,
      status: "All",
      sort: "time",
      q: query,
      locale,
    })
  );

  const firstProposal = dataArray(proposals)[0] as Record<string, unknown> | undefined;
  const proposalId = requestedProposalId ?? firstString(firstProposal?.id, dataObject(proposals)?.id);

  if (proposalId) {
    await requestJson(
      "snapshot.proposal.detail",
      buildApiUrl(baseUrl, `/api/snapshot/proposals/${encodeURIComponent(proposalId)}`, { locale })
    );
    await requestJson(
      "snapshot.proposal.translations",
      buildApiUrl(baseUrl, `/api/snapshot/proposals/${encodeURIComponent(proposalId)}/translations`)
    );
  } else {
    console.log("\n[snapshot.proposal.detail] skipped: no proposal returned; pass --proposal-id <id> to force one.");
  }
}

void main().catch((error) => {
  console.error("[snapshot] failed", error);
  process.exit(1);
});
