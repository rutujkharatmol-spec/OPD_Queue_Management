/**
 * Limits wrong-password attempts per client IP, so a short staff or admin password
 * cannot be guessed by trying every combination.
 *
 * In memory, so each server process (and each Vercel instance) counts on its own. That
 * is enough to make guessing slow; it is not an exact global limit.
 *
 * Requests with no forwarded IP (the OPD server reached directly on the LAN) are not
 * limited: they would all share one bucket, and one mistyped password at a desk could
 * then lock out every PC in the clinic.
 */

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

const failures = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || null;
  return request.headers.get('x-real-ip')?.trim() || null;
}

/** Seconds to wait before trying again, or 0 when this client may try now. */
export function loginRetryAfter(request: Request): number {
  const ip = clientIp(request);
  if (!ip) return 0;
  const entry = failures.get(ip);
  if (!entry) return 0;
  const now = Date.now();
  if (entry.resetAt <= now) {
    failures.delete(ip);
    return 0;
  }
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.resetAt - now) / 1000) : 0;
}

export function recordLoginFailure(request: Request): void {
  const ip = clientIp(request);
  if (!ip) return;
  const now = Date.now();

  // Drop expired entries now and then so the map cannot grow without bound.
  if (failures.size > 5000) {
    for (const [key, value] of failures) if (value.resetAt <= now) failures.delete(key);
  }

  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) {
    failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}
