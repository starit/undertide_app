import { NextResponse } from "next/server";
import { corsJsonResponse, handleCorsPreflight, safeApiHandler } from "@/lib/api-cors";
import { databaseMode, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export const GET = safeApiHandler(async () => {
  return corsJsonResponse({
    data: {
      ok: true,
      database: hasDatabase ? "configured" : "mock",
      mode: databaseMode,
    },
  });
});
