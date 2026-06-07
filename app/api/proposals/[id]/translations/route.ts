import { NextRequest, NextResponse } from "next/server";
import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { getProposalById, getProposalTranslation, getProposalTranslations } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

const TRANSLATION_API_S_MAXAGE_SECONDS = 600;
const TRANSLATION_API_STALE_WHILE_REVALIDATE_SECONDS = 1800;

function parseLocales(searchParams: URLSearchParams): string[] | undefined {
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

    return corsJsonResponse(
      { data: translation },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${TRANSLATION_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${TRANSLATION_API_STALE_WHILE_REVALIDATE_SECONDS}`,
        },
      }
    );
  }

  const translations = await getProposalTranslations(id, parseLocales(searchParams));
  return corsJsonResponse(
    { data: translations },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${TRANSLATION_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${TRANSLATION_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
});
