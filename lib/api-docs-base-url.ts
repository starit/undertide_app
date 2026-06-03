/**
 * Returns the canonical public base URL for API documentation.
 * On Vercel, uses the production URL; fallback to localhost for dev.
 */
export function getBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "https://undertide.xyz";
}
