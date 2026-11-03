import { NextRequest } from "next/server";
import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { parseLimitParamSafe } from "@/lib/governance/api";
import { getTallyOrganization, listTallyProposals } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

const DEFAULT_TALLY_PROPOSAL_LIMIT = 100;

export const GET = safeApiHandler(async (request: NextRequest, { params }: { params: Promise<{ idOrSlug: string }> }) => {
  const { idOrSlug } = await params;
  const organization = await getTallyOrganization(idOrSlug);

  if (!organization) {
    return corsJsonResponse({ error: "Tally organization not found", status: 404 }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const proposals = await listTallyProposals({
    q: searchParams.get("q") ?? undefined,
    organizationId: organization.id,
    status: searchParams.get("status") ?? undefined,
    chainId: searchParams.get("chainId") ?? undefined,
    limit: parseLimitParamSafe(searchParams, DEFAULT_TALLY_PROPOSAL_LIMIT),
  });

  return corsJsonResponse({ data: proposals });
});
