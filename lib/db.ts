import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "@/db/drizzle-schema";

export const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED);
export const databaseMode = process.env.DATABASE_URL
  ? "pooled"
  : process.env.DATABASE_URL_UNPOOLED
    ? "unpooled"
    : "mock";

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
}

export function getSql() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DATABASE_URL_UNPOOLED is not set.");
  }

  return neon(databaseUrl);
}

export function getDb() {
  return drizzle(getSql(), { schema });
}
