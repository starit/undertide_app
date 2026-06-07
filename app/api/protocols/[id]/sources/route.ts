import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { parseRouteId } from "@/lib/governance/api";
import { listGovernanceProtocolSources } from "@/lib/governance/repository";

export const runtime = "nodejs";

export const GET = safeApiHandler(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const parsedId = parseRouteId(id, "protocol id");
  if (!parsedId.ok) return parsedId.response;

  const response = await listGovernanceProtocolSources(parsedId.value);

  if (!response) {
    return corsJsonResponse({ error: "Protocol not found", status: 404 }, { status: 404 });
  }

  return corsJsonResponse({ data: response });
});

export async function OPTIONS() {
  return handleCorsPreflight();
}
