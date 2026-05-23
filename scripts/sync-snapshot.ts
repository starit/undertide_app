/**
 * Orchestrator: runs spaces sync then proposals incremental sync in sequence.
 * Each sub-script is spawned as a child process so they stay self-contained.
 *
 * For a first-time setup run pnpm sync:snapshot:backfill first.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const scripts = [
  "sync-snapshot-spaces.ts",
  "sync-snapshot-proposals.ts",
];

const scriptsDir = join(process.cwd(), "scripts");

for (const script of scripts) {
  console.log(`\n[orchestrator] running ${script}...`);
  const result = spawnSync("npx", ["tsx", join(scriptsDir, script)], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[orchestrator] ${script} failed with exit code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n[orchestrator] all done.");
