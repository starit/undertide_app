import "dotenv/config";
import { refreshPlatformStats } from "../lib/platform-stats-refresh";

async function main() {
  const stats = await refreshPlatformStats();
  console.log(
    JSON.stringify(
      {
        refreshed: true,
        spacesCount: stats.spacesCount,
        proposalsCount: stats.proposalsCount,
        translationsCount: stats.translationsCount,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
