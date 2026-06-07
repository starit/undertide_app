import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { parseRouteId } from "@/lib/governance/api";
import { getGovernanceProtocol } from "@/lib/governance/repository";

export const runtime = "nodejs";

export const GET = safeApiHandler(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const parsedId = parseRouteId(id, "protocol id");
  if (!parsedId.ok) return parsedId.response;

  const protocol = await getGovernanceProtocol(parsedId.value);

  if (!protocol) {
    return corsJsonResponse({ error: "Protocol not found", status: 404 }, { status: 404 });
  }

  return corsJsonResponse({ data: protocol });
});

export async function OPTIONS() {
  return handleCorsPreflight();
}
