import { NextRequest, NextResponse } from "next/server";
import { getProposalDetail } from "@/lib/repository";

export const runtime = "nodejs";

const PROPOSAL_DETAIL_API_S_MAXAGE_SECONDS = 600;
const PROPOSAL_DETAIL_API_STALE_WHILE_REVALIDATE_SECONDS = 1800;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") ?? undefined;
  const proposal = await getProposalDetail(id, locale);

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found", status: 404 }, { status: 404 });
  }

  return NextResponse.json(
    { data: proposal },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${PROPOSAL_DETAIL_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${PROPOSAL_DETAIL_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
}
