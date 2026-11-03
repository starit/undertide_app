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

type SqlClient = ReturnType<typeof neon>;
type DatabaseClient = ReturnType<typeof drizzle>;

const globalForDb = globalThis as typeof globalThis & {
  __undertideDatabaseUrl?: string;
  __undertideSql?: SqlClient;
  __undertideDb?: DatabaseClient;
};

export function getSql() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DATABASE_URL_UNPOOLED is not set.");
  }

  if (!globalForDb.__undertideSql || globalForDb.__undertideDatabaseUrl !== databaseUrl) {
    globalForDb.__undertideSql = neon(databaseUrl);
    globalForDb.__undertideDb = undefined;
    globalForDb.__undertideDatabaseUrl = databaseUrl;
  }

  return globalForDb.__undertideSql;
}

export function getDb() {
  const sql = getSql();

  if (!globalForDb.__undertideDb) {
    globalForDb.__undertideDb = drizzle(sql, { schema });
  }

  return globalForDb.__undertideDb;
}

/**
 * Log a database error with context.
 */
export function logDbError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? `\n${error.stack.split("\n").slice(0, 3).join("\n")}` : "";
  console.error(`[DB:${context}] ${message}${stack}`);
}

/**
 * Run a (usually unstable_cache-wrapped) read and degrade to `fallback` on a DB error.
 * Fetchers called inside unstable_cache must throw rather than return empty values,
 * otherwise a transient error is cached as a real empty result for the whole TTL.
 */
export async function withDbFallback<T>(context: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    logDbError(context, error);
    return fallback;
  }
}
