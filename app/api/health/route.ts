import { NextResponse } from "next/server";
import { databaseMode, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    database: hasDatabase ? "configured" : "mock",
    mode: databaseMode,
  });
}
