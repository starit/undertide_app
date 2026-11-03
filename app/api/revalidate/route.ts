import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_TAGS = ["spaces", "proposals", "translations", "governance", "snapshot", "tally", "sync"] as const;

/**
 * POST /api/revalidate?tag=spaces
 *
 * Invalidates the Next.js data cache for the given tag.
 * Requires the `x-revalidate-secret` header to match REVALIDATE_SECRET; when the
 * secret is not configured the endpoint is disabled. Called by the sync scripts.
 */
export async function POST(request: NextRequest) {
  const internalSecret = process.env.REVALIDATE_SECRET;
  if (!internalSecret) {
    return NextResponse.json({ error: "Revalidation is not configured" }, { status: 503 });
  }

  if (!secretMatches(request.headers.get("x-revalidate-secret"), internalSecret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag");

  if (!tag) {
    return NextResponse.json({ error: "Missing 'tag' query parameter" }, { status: 400 });
  }

  if (!ALLOWED_TAGS.includes(tag as typeof ALLOWED_TAGS[number])) {
    return NextResponse.json({ error: `Tag '${tag}' is not allowed` }, { status: 403 });
  }

  revalidateTag(tag);

  return NextResponse.json({ revalidated: true, tag, now: Date.now() });
}

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
