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
  printUsage("Aggregate API examples", [
    "pnpm example:api:aggregate",
    "pnpm example:api:aggregate -- --base-url http://localhost:3000 --limit 3",
    "pnpm example:api:aggregate -- --q uniswap --source tally",
    "pnpm example:api:aggregate -- --protocol uniswap --status-group Active --sort heat",
    "",
    "Calls:",
    "- GET /api/sources",
    "- GET /api/sync",
    "- GET /api/protocols",
    "- GET /api/protocols/[id]",
    "- GET /api/protocols/[id]/sources",
    "- GET /api/protocols/[id]/proposals",
    "",
    "Note: top-level aggregate /api/proposals is still planned; /api/proposals remains legacy Snapshot-compatible.",
  ]);
  process.exit(0);
}

const baseUrl = getBaseUrl();
const limit = getLimit(5);
const query = readArgValue("--q");
const source = readArgValue("--source") ?? "all";
const requestedProtocol = readArgValue("--protocol");
const statusGroup = readArgValue("--status-group") ?? "All";
const sort = readArgValue("--sort") ?? "time";
const chainId = readArgValue("--chain-id");

async function main() {
  await requestJson("aggregate.sources", buildApiUrl(baseUrl, "/api/sources"));
  await requestJson("aggregate.sync", buildApiUrl(baseUrl, "/api/sync"));

  const protocols = await requestJson(
    "aggregate.protocols",
    buildApiUrl(baseUrl, "/api/protocols", {
      limit,
      q: query,
      source,
    })
  );

  const firstProtocol = dataArray(protocols)[0] as Record<string, unknown> | undefined;
  const protocolId = requestedProtocol ?? firstString(firstProtocol?.slug, firstProtocol?.id);

  if (!protocolId) {
    console.log("\n[aggregate.protocol.detail] skipped: no protocol returned; pass --protocol <idOrSlug> to force one.");
    return;
  }

  await requestJson("aggregate.protocol.detail", buildApiUrl(baseUrl, `/api/protocols/${encodeURIComponent(protocolId)}`));
  await requestJson("aggregate.protocol.sources", buildApiUrl(baseUrl, `/api/protocols/${encodeURIComponent(protocolId)}/sources`));
  await requestJson(
    "aggregate.protocol.proposals",
    buildApiUrl(baseUrl, `/api/protocols/${encodeURIComponent(protocolId)}/proposals`, {
      limit,
      source,
      statusGroup,
      sort,
      chainId,
      q: query,
    })
  );
}

void main().catch((error) => {
  console.error("[aggregate] failed", error);
  process.exit(1);
});
