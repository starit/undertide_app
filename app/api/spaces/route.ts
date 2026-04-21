import { NextRequest, NextResponse } from "next/server";
import { listSpaces } from "@/lib/repository";

export const runtime = "nodejs";
const DEFAULT_SPACE_LIMIT = 200;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const spaces = await listSpaces({
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    verified: searchParams.get("verified") === null ? undefined : searchParams.get("verified") === "true",
    sort: (searchParams.get("sort") as "activity" | "followers" | null) ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : DEFAULT_SPACE_LIMIT,
  });

  return NextResponse.json({ data: spaces });
}
