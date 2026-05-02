import { NextResponse } from "next/server";
import { GOVERNANCE_SOURCES } from "@/lib/governance/sources";
import { listSnapshotSyncStates, listTallySyncStates } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET() {
  const [snapshotStates, tallyStates] = await Promise.all([
    listSnapshotSyncStates([GOVERNANCE_SOURCES.snapshot.spaceEntityType, GOVERNANCE_SOURCES.snapshot.proposalEntityType]),
    listTallySyncStates([GOVERNANCE_SOURCES.tally.spaceEntityType, GOVERNANCE_SOURCES.tally.proposalEntityType]),
  ]);

  return NextResponse.json({
    data: [
      {
        source: "snapshot",
        label: GOVERNANCE_SOURCES.snapshot.label,
        syncedAt: latestSuccessfulSync(snapshotStates),
        supports: {
          protocols: false,
          sourceObjects: true,
          proposals: true,
          votes: false,
          execution: false,
          translations: true,
          bodySearch: true,
        },
      },
      {
        source: "tally",
        label: GOVERNANCE_SOURCES.tally.label,
        syncedAt: latestSuccessfulSync(tallyStates),
        supports: {
          protocols: false,
          sourceObjects: true,
          proposals: true,
          votes: true,
          execution: true,
          translations: false,
          bodySearch: true,
        },
      },
    ],
  });
}

function latestSuccessfulSync(states: Array<{ lastSuccessAt: string | null }>) {
  const timestamps = states
    .map((state) => state.lastSuccessAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return timestamps.at(-1) ?? null;
}
