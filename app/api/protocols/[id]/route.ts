import { NextResponse } from "next/server";
import { parseRouteId } from "@/lib/governance/api";
import { getGovernanceProtocol } from "@/lib/governance/repository";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = parseRouteId(id, "protocol id");
  if (!parsedId.ok) return parsedId.response;

  const protocol = await getGovernanceProtocol(parsedId.value);

  if (!protocol) {
    return NextResponse.json({ error: "Protocol not found" }, { status: 404 });
  }

  return NextResponse.json({ data: protocol });
}
