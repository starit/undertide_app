import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { getSpaceBySlug } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export const GET = safeApiHandler(async (_: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);

  if (!space) {
    return corsJsonResponse({ error: "Space not found", status: 404 }, { status: 404 });
  }

  return corsJsonResponse({ data: space });
});
