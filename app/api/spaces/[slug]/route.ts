import { NextRequest, NextResponse } from "next/server";
import { corsJsonResponse, handleCorsPreflight } from "@/lib/api-cors";
import { getSpaceBySlug } from "@/lib/repository";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

const SPACE_DETAIL_API_S_MAXAGE_SECONDS = 300;
const SPACE_DETAIL_API_STALE_WHILE_REVALIDATE_SECONDS = 600;

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);

  if (!space) {
    return corsJsonResponse({ error: "Space not found" }, { status: 404 });
  }

  return corsJsonResponse(
    { data: space },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${SPACE_DETAIL_API_S_MAXAGE_SECONDS}, stale-while-revalidate=${SPACE_DETAIL_API_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    }
  );
}
