/** IP → last successful rate-check timestamp (ms). In-memory; resets per Node process (serverless cold start). */
const lastAllowedAt = new Map<string, number>();

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

export function getClientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
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
 * Enforces at most one theme generation attempt per IP per `minIntervalMs`.
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
  lastAllowedAt.set(ip, now);
  return { ok: true };
}
