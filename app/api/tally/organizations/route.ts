import { NextRequest, NextResponse } from "next/server";
import { listTallyOrganizations } from "@/lib/repository";

export const runtime = "nodejs";

const DEFAULT_TALLY_ORGANIZATION_LIMIT = 100;
const TALLY_API_S_MAXAGE_SECONDS = 120;
const TALLY_API_STALE_WHILE_REVALIDATE_SECONDS = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const organizations = await listTallyOrganizations({
    q: searchParams.get("q") ?? undefined,
    hasActiveProposals:
      searchParams.get("hasActiveProposals") === null
        ? undefined
        : searchParams.get("hasActiveProposals") === "true",
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : DEFAULT_TALLY_ORGANIZATION_LIMIT,
  });

  return NextResponse.json(
    { data: organizations },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${TALLY_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${TALLY_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
}
