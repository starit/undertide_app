import { NextResponse } from "next/server";
import { getTallyOrganization } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ idOrSlug: string }> }) {
  const { idOrSlug } = await params;
  const organization = await getTallyOrganization(idOrSlug);

  if (!organization) {
    return NextResponse.json({ error: "Tally organization not found" }, { status: 404 });
  }

  return NextResponse.json({ data: organization });
}
