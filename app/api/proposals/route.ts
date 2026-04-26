import { NextRequest, NextResponse } from "next/server";
import { listProposals } from "@/lib/repository";

export const runtime = "nodejs";
const PROPOSAL_API_S_MAXAGE_SECONDS = 60;
const PROPOSAL_API_STALE_WHILE_REVALIDATE_SECONDS = 180;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const proposals = await listProposals({
    q: searchParams.get("q") ?? undefined,
    status: (searchParams.get("status") as "Active" | "Upcoming" | "Closed" | "Executed" | "All" | null) ?? undefined,
    sort: (searchParams.get("sort") as "time" | "heat" | null) ?? undefined,
    spaceSlug: searchParams.get("spaceSlug") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    locale: searchParams.get("locale") ?? undefined,
    translatedOnly: searchParams.get("translatedOnly") === "true",
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
