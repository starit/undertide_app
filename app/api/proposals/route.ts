import { NextRequest, NextResponse } from "next/server";
import { listProposals } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const proposals = await listProposals({
    q: searchParams.get("q") ?? undefined,
    status: (searchParams.get("status") as "Active" | "Upcoming" | "Closed" | "Executed" | "All" | null) ?? undefined,
    sort: (searchParams.get("sort") as "time" | "heat" | null) ?? undefined,
    spaceSlug: searchParams.get("spaceSlug") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  });

  return NextResponse.json({ data: proposals });
}
