import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { getTallyProposal } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export const GET = safeApiHandler(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const proposal = await getTallyProposal(id);

  if (!proposal) {
    return corsJsonResponse({ error: "Tally proposal not found", status: 404 }, { status: 404 });
  }

  return corsJsonResponse({ data: proposal });
});
