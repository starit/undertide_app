import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");

async function main() {
  const sql = neon(url!);
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "db/migrations/drizzle" });
  console.log("Migrations applied successfully.");
}

main().catch((err) => { console.error(err); process.exit(1); });
