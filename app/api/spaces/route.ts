import { NextRequest, NextResponse } from "next/server";
import { parseLimitParamSafe } from "@/lib/governance/api";
import { listSpaces } from "@/lib/repository";

export const runtime = "nodejs";

import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";

export async function OPTIONS() {
  return handleCorsPreflight();
}

const DEFAULT_SPACE_LIMIT = 200;
const SPACE_API_S_MAXAGE_SECONDS = 120;
const SPACE_API_STALE_WHILE_REVALIDATE_SECONDS = 300;

export const GET = safeApiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const spaces = await listSpaces({
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    verified: searchParams.get("verified") === null ? undefined : searchParams.get("verified") === "true",
    sort: (searchParams.get("sort") as "activity" | "followers" | null) ?? undefined,
    limit: parseLimitParamSafe(searchParams, DEFAULT_SPACE_LIMIT),
  });

  return corsJsonResponse(
    { data: spaces },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${SPACE_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${SPACE_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
});
