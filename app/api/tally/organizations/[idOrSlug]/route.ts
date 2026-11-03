import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { getTallyOrganization } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export const GET = safeApiHandler(async (_: Request, { params }: { params: Promise<{ idOrSlug: string }> }) => {
  const { idOrSlug } = await params;
  const organization = await getTallyOrganization(idOrSlug);

  if (!organization) {
    return corsJsonResponse({ error: "Tally organization not found", status: 404 }, { status: 404 });
  }

  return corsJsonResponse({ data: organization });
});
