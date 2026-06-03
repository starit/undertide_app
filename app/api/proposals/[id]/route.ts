import { NextRequest, NextResponse } from "next/server";
import { corsJsonResponse, handleCorsPreflight } from "@/lib/api-cors";
import { getProposalDetail } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

const PROPOSAL_DETAIL_API_S_MAXAGE_SECONDS = 300;
const PROPOSAL_DETAIL_API_STALE_WHILE_REVALIDATE_SECONDS = 600;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") ?? undefined;
  const proposal = await getProposalDetail(id, locale);

  if (!proposal) {
    return corsJsonResponse({ error: "Proposal not found" }, { status: 404 });
  }

  return corsJsonResponse(
    { data: proposal },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${PROPOSAL_DETAIL_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${PROPOSAL_DETAIL_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
}
