/**
 * Fixed-window, in-memory rate limiter. Good enough to stop a casual loop against a demo;
 * it is per server instance, so production should move this to a shared store (e.g. Redis).
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }: { limit: number; windowMs: number; now?: () => number }) {
  const windows = new Map<string, { start: number; count: number }>();
  const MAX_KEYS = 10_000;

  return function allow(key: string): boolean {
    const t = now();
    const w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      if (windows.size >= MAX_KEYS) windows.clear();
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    if (w.count >= limit) return false;
    w.count += 1;
    return true;
  };
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
