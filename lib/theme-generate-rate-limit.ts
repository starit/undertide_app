/** IP → last successful rate-check timestamp (ms). In-memory; resets per Node process (serverless cold start). */
const lastAllowedAt = new Map<string, number>();
/** Timestamps (ms) of every admitted request in the last minute, across all IPs. */
const recentAdmissions: number[] = [];

const PRUNE_THRESHOLD = 2000;
const STALE_MULTIPLIER = 24;

function parseMinIntervalMs(): number {
  const raw = process.env.THEME_GENERATE_MIN_INTERVAL_MS?.trim();
  if (!raw) return 5000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 5000;
  return Math.min(Math.max(n, 0), 3600_000);
}

export function getThemeGenerateMinIntervalMs(): number {
  return parseMinIntervalMs();
}

/** Per-instance ceiling on paid LLM calls, regardless of how many distinct IPs ask. */
function parseMaxPerMinute(): number {
  const raw = process.env.THEME_GENERATE_MAX_PER_MINUTE?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 20;
}

/**
 * Client IP for rate limiting. Prefers headers the hosting proxy sets itself (Vercel
 * overwrites `x-real-ip` / `x-vercel-forwarded-for`); for `x-forwarded-for` the last hop
 * is used, since that is the one appended by the nearest proxy rather than the client.
 */
export function getClientIpFromRequest(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelForwarded) return vercelForwarded;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").pop()?.trim();
    if (last) return last;
  }
  return "unknown";
}

function pruneStale(now: number, minIntervalMs: number): void {
  if (lastAllowedAt.size < PRUNE_THRESHOLD) return;
  const cutoff = now - minIntervalMs * STALE_MULTIPLIER;
  for (const [ip, t] of lastAllowedAt) {
    if (t < cutoff) lastAllowedAt.delete(ip);
  }
}

/**
 * Enforces at most one theme generation attempt per IP per `minIntervalMs`, and at most
 * THEME_GENERATE_MAX_PER_MINUTE attempts per instance overall.
 * Records timestamp when the slot is consumed (before calling the LLM).
 */
export function consumeThemeGenerateRateSlot(
  ip: string,
  minIntervalMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  pruneStale(now, minIntervalMs);
  const last = lastAllowedAt.get(ip) ?? 0;
  const elapsed = now - last;
  if (elapsed < minIntervalMs) {
    const retryAfterMs = minIntervalMs - elapsed;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  while (recentAdmissions.length > 0 && recentAdmissions[0] <= now - 60_000) recentAdmissions.shift();
  if (recentAdmissions.length >= parseMaxPerMinute()) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recentAdmissions[0] + 60_000 - now) / 1000)) };
  }

  lastAllowedAt.set(ip, now);
  recentAdmissions.push(now);
  return { ok: true };
}
