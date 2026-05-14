import { NextRequest, NextResponse } from "next/server";
import {
  parseLimitParam,
  parseProtocolProposalSortParam,
  parseProtocolSourceParam,
  parseProtocolStatusGroupParam,
  parseRouteId,
  parseTextParam,
} from "@/lib/governance/api";
import { listGovernanceProtocolProposals } from "@/lib/governance/repository";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const parsedId = parseRouteId(id, "protocol id");
  if (!parsedId.ok) return parsedId.response;

  const source = parseProtocolSourceParam(searchParams);
  if (!source.ok) return source.response;

  const statusGroup = parseProtocolStatusGroupParam(searchParams);
  if (!statusGroup.ok) return statusGroup.response;

  const sort = parseProtocolProposalSortParam(searchParams);
  if (!sort.ok) return sort.response;

  const limit = parseLimitParam(searchParams);
  if (!limit.ok) return limit.response;

  const response = await listGovernanceProtocolProposals(parsedId.value, {
    q: parseTextParam(searchParams, "q"),
    source: source.value,
    statusGroup: statusGroup.value,
    status: parseTextParam(searchParams, "status"),
    chainId: parseTextParam(searchParams, "chainId"),
    sort: sort.value,
    limit: limit.value,
  });

  if (!response) {
    return NextResponse.json({ error: "Protocol not found" }, { status: 404 });
  }

  return NextResponse.json(response);
}
