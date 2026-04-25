import { NextRequest, NextResponse } from "next/server";
import { listSpaceProposals } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const proposals = await listSpaceProposals(slug, {
    q: searchParams.get("q") ?? undefined,
    status: (searchParams.get("status") as "Active" | "Upcoming" | "Closed" | "Executed" | "All" | null) ?? undefined,
    sort: (searchParams.get("sort") as "time" | "heat" | null) ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    locale: searchParams.get("locale") ?? undefined,
  });

  return NextResponse.json({ data: proposals });
}
