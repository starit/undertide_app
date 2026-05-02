import { NextRequest, NextResponse } from "next/server";
import { getProposalById, getProposalTranslation, getProposalTranslations } from "@/lib/repository";

export const runtime = "nodejs";

function parseLocales(searchParams: URLSearchParams) {
  const locales = searchParams.getAll("locale").filter(Boolean);
  return locales.length > 0 ? locales : undefined;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await getProposalById(id);

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");

  if (locale) {
    const translation = await getProposalTranslation(id, locale);
    if (!translation) {
      return NextResponse.json({ error: "Translation not found" }, { status: 404 });
    }

    return NextResponse.json({ data: translation });
  }

  const translations = await getProposalTranslations(id, parseLocales(searchParams));
  return NextResponse.json({ data: translations });
}
