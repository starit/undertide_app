import { NextResponse } from "next/server";
import { getSpaceBySlug } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);

  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  return NextResponse.json({ data: space });
}
