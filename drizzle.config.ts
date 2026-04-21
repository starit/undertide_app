import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL or DATABASE_URL_UNPOOLED is required for Drizzle.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/drizzle-schema.ts",
  out: "./db/migrations/drizzle",
  dbCredentials: {
    url,
  },
  verbose: true,
  strict: true,
});
