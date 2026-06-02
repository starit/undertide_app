import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_TAGS = ["spaces", "proposals", "translations", "governance", "snapshot", "tally"] as const;

/**
 * POST /api/revalidate?tag=spaces
 *
 * Invalidates the Next.js data cache for the given tag.
 * Only callable from internal cron/sync scripts (localhost only).
 */
export async function POST(request: NextRequest) {
  // Only allow local requests or requests with a matching internal secret
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const isLocal =
    origin === undefined ||
    origin === null ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host?.startsWith("localhost:") ||
    host?.startsWith("127.0.0.1:");
  const secret = request.headers.get("x-revalidate-secret");
  const internalSecret = process.env.REVALIDATE_SECRET;

  if (!isLocal && (!internalSecret || secret !== internalSecret)) {
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
