import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window limiter held in process memory. Good enough for one long-lived
 * Node process; a serverless deployment with several instances needs a shared
 * store (Upstash/Redis) before this is trustworthy.
 */
export function rateLimit(options: {
  limit: number;
  windowMs: number;
  message: string;
}): MiddlewareHandler {
  const windows = new Map<string, Window>();

  return async (c, next) => {
    const key = clientKey(c);
    const now = Date.now();
    const existing = windows.get(key);

    if (!existing || existing.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + options.windowMs });
      sweep(windows, now);
      return next();
    }

    if (existing.count >= options.limit) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: options.message, retryAfter }, 429);
    }

    existing.count += 1;
    return next();
  };
}

function clientKey(c: Context): string {
  // Behind Vercel the client IP is the first entry of x-forwarded-for.
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return getConnInfo(c).remote.address ?? "unknown";
}

/** Keeps the map from growing without bound on a long-running process. */
function sweep(windows: Map<string, Window>, now: number): void {
  if (windows.size < 1000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}
