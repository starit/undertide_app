import { NextRequest, NextResponse } from "next/server";
import { parseLimitParamSafe } from "@/lib/governance/api";
import { listProposals } from "@/lib/repository";

export const runtime = "nodejs";

import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";

export async function OPTIONS() {
  return handleCorsPreflight();
}

const DEFAULT_PROPOSAL_LIMIT = 24;
const PROPOSAL_API_S_MAXAGE_SECONDS = 60;
const PROPOSAL_API_STALE_WHILE_REVALIDATE_SECONDS = 180;

export const GET = safeApiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const proposals = await listProposals({
    q: searchParams.get("q") ?? undefined,
    status: (searchParams.get("status") as "Active" | "Upcoming" | "Closed" | "Executed" | "All" | null) ?? undefined,
    sort: (searchParams.get("sort") as "time" | null) ?? undefined,
    spaceSlug: searchParams.get("spaceSlug") ?? undefined,
    limit: parseLimitParamSafe(searchParams, DEFAULT_PROPOSAL_LIMIT),
    locale: searchParams.get("locale") ?? undefined,
    translatedOnly: searchParams.get("translatedOnly") === "true",
  });

  return corsJsonResponse(
    { data: proposals },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${PROPOSAL_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${PROPOSAL_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
});
