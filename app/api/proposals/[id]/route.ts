import { NextRequest, NextResponse } from "next/server";
import { getProposalDetail } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") ?? undefined;
  const proposal = await getProposalDetail(id, locale);

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  return NextResponse.json({ data: proposal });
}
