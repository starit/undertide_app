/**
 * Unified CORS headers for public API routes.
 *
 * UnderTide's public API is open for read — no API key required.
 * Rate limiting is handled at the platform level (Vercel + CDN).
 */

export const PUBLIC_API_ALLOWED_ORIGINS = ["*"] as const;

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

/**
 * Returns a Response (200 OK) for CORS preflight OPTIONS requests.
 * Add this to the OPTIONS handler of any public API route.
 */
export function handleCorsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Wraps NextResponse.json with CORS headers added.
 */
export function corsJsonResponse(
  body: unknown,
  init?: ResponseInit
): Response {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(JSON.stringify(body), {
    ...init,
    status: init?.status ?? 200,
    headers,
  });
}
