import { NextRequest, NextResponse } from "next/server";
import { parseLimitParam, parseProtocolSourceParam, parseTextParam } from "@/lib/governance/api";
import { listGovernanceProtocols } from "@/lib/governance/repository";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const source = parseProtocolSourceParam(searchParams);
  if (!source.ok) return source.response;

  const limit = parseLimitParam(searchParams);
  if (!limit.ok) return limit.response;

  const response = await listGovernanceProtocols({
    q: parseTextParam(searchParams, "q"),
    source: source.value,
    limit: limit.value,
  });

  return NextResponse.json(response);
}
