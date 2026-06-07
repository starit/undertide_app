import { NextRequest, NextResponse } from "next/server";
import { parseLimitParamSafe } from "@/lib/governance/api";
import { listSpaceProposals } from "@/lib/repository";

export const runtime = "nodejs";

const DEFAULT_PROPOSAL_LIMIT = 24;
const PROPOSAL_API_S_MAXAGE_SECONDS = 60;
const PROPOSAL_API_STALE_WHILE_REVALIDATE_SECONDS = 180;

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const proposals = await listSpaceProposals(slug, {
    q: searchParams.get("q") ?? undefined,
    status: (searchParams.get("status") as "Active" | "Upcoming" | "Closed" | "Executed" | "All" | null) ?? undefined,
    sort: (searchParams.get("sort") as "time" | null) ?? undefined,
    limit: parseLimitParamSafe(searchParams, DEFAULT_PROPOSAL_LIMIT),
    locale: searchParams.get("locale") ?? undefined,
  });

  return NextResponse.json(
    { data: proposals },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${PROPOSAL_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${PROPOSAL_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
}
