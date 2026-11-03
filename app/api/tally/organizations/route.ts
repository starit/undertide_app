import { NextRequest } from "next/server";
import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { parseLimitParamSafe } from "@/lib/governance/api";
import { listTallyOrganizations } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

const DEFAULT_TALLY_ORGANIZATION_LIMIT = 100;
const TALLY_API_S_MAXAGE_SECONDS = 120;
const TALLY_API_STALE_WHILE_REVALIDATE_SECONDS = 300;

export const GET = safeApiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const organizations = await listTallyOrganizations({
    q: searchParams.get("q") ?? undefined,
    hasActiveProposals:
      searchParams.get("hasActiveProposals") === null
        ? undefined
        : searchParams.get("hasActiveProposals") === "true",
    limit: parseLimitParamSafe(searchParams, DEFAULT_TALLY_ORGANIZATION_LIMIT),
  });

  return corsJsonResponse(
    { data: organizations },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${TALLY_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${TALLY_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
});
