import { NextResponse } from "next/server";
import { GOVERNANCE_SOURCES } from "@/lib/governance/sources";
import { listSnapshotSyncStates, listTallySyncStates } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET() {
  const [snapshot, tally] = await Promise.all([
    listSnapshotSyncStates([GOVERNANCE_SOURCES.snapshot.spaceEntityType, GOVERNANCE_SOURCES.snapshot.proposalEntityType]),
    listTallySyncStates(),
  ]);

  return NextResponse.json({
    data: {
      snapshot,
      tally,
    },
  });
}
