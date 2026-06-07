import { NextRequest, NextResponse } from "next/server";
import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { getProposalDetail } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

const PROPOSAL_DETAIL_API_S_MAXAGE_SECONDS = 300;
const PROPOSAL_DETAIL_API_STALE_WHILE_REVALIDATE_SECONDS = 600;

export const GET = safeApiHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") ?? undefined;
  const proposal = await getProposalDetail(id, locale);

  if (!proposal) {
    return corsJsonResponse({ error: "Proposal not found", status: 404 }, { status: 404 });
  }

  return corsJsonResponse(
    { data: proposal },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${PROPOSAL_DETAIL_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${PROPOSAL_DETAIL_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
});
