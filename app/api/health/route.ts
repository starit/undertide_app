import { NextResponse } from "next/server";
import { corsJsonResponse, handleCorsPreflight } from "@/lib/api-cors";
import { databaseMode, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET() {
  return corsJsonResponse({
    ok: true,
    database: hasDatabase ? "configured" : "mock",
    mode: databaseMode,
  });
}
