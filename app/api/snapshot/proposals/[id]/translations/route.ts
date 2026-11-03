import { NextRequest } from "next/server";
import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { getProposalById, getProposalTranslation, getProposalTranslations } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

function parseLocales(searchParams: URLSearchParams) {
  const locales = searchParams.getAll("locale").filter(Boolean);
  return locales.length > 0 ? locales : undefined;
}

export const GET = safeApiHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const proposal = await getProposalById(id);

  if (!proposal) {
    return corsJsonResponse({ error: "Proposal not found", status: 404 }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");

  if (locale) {
    const translation = await getProposalTranslation(id, locale);
    if (!translation) {
      return corsJsonResponse({ error: "Translation not found", status: 404 }, { status: 404 });
    }

    return corsJsonResponse({ data: translation });
  }

  const translations = await getProposalTranslations(id, parseLocales(searchParams));
  return corsJsonResponse({ data: translations });
});
