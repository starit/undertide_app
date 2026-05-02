import { NextResponse } from "next/server";
import { getTallyProposal } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await getTallyProposal(id);

  if (!proposal) {
    return NextResponse.json({ error: "Tally proposal not found" }, { status: 404 });
  }

  return NextResponse.json({ data: proposal });
}
