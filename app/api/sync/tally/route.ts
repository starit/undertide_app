import { NextRequest, NextResponse } from "next/server";
import { listTallySyncStates } from "@/lib/repository";

export const runtime = "nodejs";

function parseEntityTypes(searchParams: URLSearchParams) {
  const values = searchParams.getAll("entityType").filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityTypes = parseEntityTypes(searchParams);
  const states = await listTallySyncStates(entityTypes);

  return NextResponse.json({ data: states });
}
