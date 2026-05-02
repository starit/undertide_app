import { NextRequest, NextResponse } from "next/server";
import { getTallyOrganization, listTallyProposals } from "@/lib/repository";

export const runtime = "nodejs";

const DEFAULT_TALLY_PROPOSAL_LIMIT = 100;

export async function GET(request: NextRequest, { params }: { params: Promise<{ idOrSlug: string }> }) {
  const { idOrSlug } = await params;
  const organization = await getTallyOrganization(idOrSlug);

  if (!organization) {
    return NextResponse.json({ error: "Tally organization not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const proposals = await listTallyProposals({
    q: searchParams.get("q") ?? undefined,
    organizationId: organization.id,
    status: searchParams.get("status") ?? undefined,
    chainId: searchParams.get("chainId") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : DEFAULT_TALLY_PROPOSAL_LIMIT,
  });

  return NextResponse.json({ data: proposals });
}
