/**
 * Sync health check — exits 0 if all monitored jobs are current, 1 if any are stale.
 *
 * Usage:
 *   pnpm check:sync:health
 *   npx tsx scripts/check-sync-health.ts
 *
 * Add to crontab to alert on stale sync (example — sends mail on failure):
 *   0 * * * * cd $DIR && $PNPM check:sync:health >> $LOG/health.log 2>&1 || echo "sync stale" | mail -s "undertide sync stale" you@example.com
 */
import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { snapshotSyncRuns, snapshotSyncState } from "../db/drizzle-schema";
import { createDb } from "./sync-snapshot-shared";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");

const db = createDb(databaseUrl);

// Each entry: how long (minutes) before we consider the sync stale.
// Set relative to the cron schedule with ~2× headroom for slow runs.
const CHECKS: Array<{ entityType: string; label: string; warnMinutes: number; criticalMinutes: number }> = [
  { entityType: "spaces",           label: "Snapshot spaces",    warnMinutes:  60, criticalMinutes:  120 },
  { entityType: "proposals",        label: "Snapshot proposals", warnMinutes:  30, criticalMinutes:   60 },
  { entityType: "tally:organizations", label: "Tally orgs",     warnMinutes: 240, criticalMinutes:  360 },
  { entityType: "tally:proposals",  label: "Tally proposals",   warnMinutes: 240, criticalMinutes:  360 },
];

type HealthStatus = "ok" | "warn" | "critical" | "never";

interface CheckResult {
  entityType: string;
  label: string;
  status: HealthStatus;
  lastSuccessAt: Date | null;
  ageMinutes: number | null;
  lastError: string | null;
}

async function checkEntity(check: (typeof CHECKS)[number]): Promise<CheckResult> {
  const [state] = await db
    .select({ lastSuccessAt: snapshotSyncState.lastSuccessAt, lastError: snapshotSyncState.lastError })
    .from(snapshotSyncState)
    .where(eq(snapshotSyncState.entityType, check.entityType))
    .limit(1);

  if (!state?.lastSuccessAt) {
    return { ...check, status: "never", lastSuccessAt: null, ageMinutes: null, lastError: state?.lastError ?? null };
  }

  const ageMs = Date.now() - state.lastSuccessAt.getTime();
  const ageMinutes = Math.round(ageMs / 60_000);

  let status: HealthStatus = "ok";
  if (ageMinutes >= check.criticalMinutes) status = "critical";
  else if (ageMinutes >= check.warnMinutes) status = "warn";

  return { ...check, status, lastSuccessAt: state.lastSuccessAt, ageMinutes, lastError: state.lastError ?? null };
}

async function getRecentFailures(entityType: string, limit = 3): Promise<string[]> {
  const rows = await db
    .select({ error: snapshotSyncRuns.error, createdAt: snapshotSyncRuns.createdAt })
    .from(snapshotSyncRuns)
    .where(eq(snapshotSyncRuns.status, "error"))
    .orderBy(desc(snapshotSyncRuns.createdAt))
    .limit(limit);
  // filter by entity type manually since we don't have the column in scope easily
  void entityType; // checked via snapshotSyncState above; recent failures here are global
  return rows.map((r) => `  [${r.createdAt.toISOString()}] ${r.error ?? "unknown error"}`);
}

async function main() {
  const now = new Date();
  console.log(`[health] check started at ${now.toISOString()}`);
  console.log("");

  const results = await Promise.all(CHECKS.map(checkEntity));

  let exitCode = 0;
  const STATUS_ICON: Record<HealthStatus, string> = { ok: "✓", warn: "!", critical: "✗", never: "?" };

  for (const r of results) {
    const icon = STATUS_ICON[r.status];
    const age = r.ageMinutes !== null ? `${r.ageMinutes} min ago` : "never succeeded";
    const errorNote = r.lastError ? `  last_error: ${r.lastError.slice(0, 120)}` : "";

    console.log(`[${icon}] ${r.label} (${r.entityType}): ${r.status.toUpperCase()} — last success ${age}${errorNote}`);

    if (r.status === "critical" || r.status === "never") exitCode = 1;
    if (r.status === "warn" && exitCode === 0) exitCode = 0; // warn doesn't fail exit code; adjust if desired
  }

  console.log("");

  const anyBad = results.some((r) => r.status === "critical" || r.status === "never");
  if (anyBad) {
    console.log("[health] RESULT: STALE — one or more syncs have not succeeded recently.");
  } else if (results.some((r) => r.status === "warn")) {
    console.log("[health] RESULT: WARNING — some syncs are running late but within tolerance.");
  } else {
    console.log("[health] RESULT: OK — all syncs are current.");
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error("[health] check failed:", error);
  process.exit(1);
});
