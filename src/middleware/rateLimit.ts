// ============================================================
// CallFirst API — Rate Limiting Middleware
// In-memory sliding window — good enough for single-instance Railway
// ============================================================

import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitConfig {
  /** Max requests per window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * Rate limit by IP address.
 * Chat endpoint: 30 req/min (one conversation)
 * Lead endpoint: 5 req/min (prevent spam submissions)
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';

    const key = `${ip}:${c.req.path}`;
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;

    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      c.header('X-RateLimit-Limit', config.max.toString());
      c.header('X-RateLimit-Remaining', (config.max - 1).toString());
      await next();
      return;
    }

    entry.count++;

    if (entry.count > config.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', retryAfter.toString());
      return c.json(
        { error: 'Too many requests. Please try again shortly.' },
        429
      );
    }

    c.header('X-RateLimit-Limit', config.max.toString());
    c.header('X-RateLimit-Remaining', (config.max - entry.count).toString());
    await next();
  };
}
