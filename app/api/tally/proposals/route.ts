import { NextRequest, NextResponse } from "next/server";
import { listTallyProposals } from "@/lib/repository";

export const runtime = "nodejs";

const DEFAULT_TALLY_PROPOSAL_LIMIT = 100;
const TALLY_API_S_MAXAGE_SECONDS = 60;
const TALLY_API_STALE_WHILE_REVALIDATE_SECONDS = 180;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const proposals = await listTallyProposals({
    q: searchParams.get("q") ?? undefined,
    organizationId: searchParams.get("organizationId") ?? undefined,
    organizationSlug: searchParams.get("organizationSlug") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    chainId: searchParams.get("chainId") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : DEFAULT_TALLY_PROPOSAL_LIMIT,
  });

  return NextResponse.json(
    { data: proposals },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${TALLY_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${TALLY_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
}
