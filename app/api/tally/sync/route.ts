import { NextRequest } from "next/server";
import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { listTallySyncStates } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

function parseEntityTypes(searchParams: URLSearchParams) {
  const values = searchParams.getAll("entityType").filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export const GET = safeApiHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityTypes = entityType ? [entityType] : parseEntityTypes(searchParams);
  const states = await listTallySyncStates(entityTypes);

  return corsJsonResponse({ data: states });
});
