import { NextResponse } from "next/server";
import { parseRouteId } from "@/lib/governance/api";
import { listGovernanceProtocolSources } from "@/lib/governance/repository";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = parseRouteId(id, "protocol id");
  if (!parsedId.ok) return parsedId.response;

  const response = await listGovernanceProtocolSources(parsedId.value);

  if (!response) {
    return NextResponse.json({ error: "Protocol not found" }, { status: 404 });
  }

  return NextResponse.json({ data: response });
}
