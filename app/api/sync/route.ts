import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { GOVERNANCE_SOURCES } from "@/lib/governance/sources";
import { listSnapshotSyncStates, listTallySyncStates } from "@/lib/repository";

export const runtime = "nodejs";

export const GET = safeApiHandler(async () => {
  const [snapshot, tally] = await Promise.all([
    listSnapshotSyncStates([GOVERNANCE_SOURCES.snapshot.spaceEntityType, GOVERNANCE_SOURCES.snapshot.proposalEntityType]),
    listTallySyncStates(),
  ]);

  return corsJsonResponse({
    data: {
      snapshot,
      tally,
    },
  });
});

export async function OPTIONS() {
  return handleCorsPreflight();
}
