import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { env } from "../env.js";

/**
 * Bearer-key guard for the machine-facing `/api/*` routes (the voice AI, Postman,
 * curl). The admin console's cookie session is useless to a server-side
 * caller, and CORS only restrains browsers, so these routes get their own
 * secret: `KNOWLEDGE_API_KEY` in `backend/.env`.
 *
 * No key configured means the routes are **closed** (503), never open —
 * the same "no default credentials" rule as the admin console. The comparison
 * hashes both sides first so a length mismatch can't be timed either.
 */
export const requireApiKey: MiddlewareHandler = async (c, next) => {
  if (!env.KNOWLEDGE_API_KEY) {
    return c.json(
      { error: "The knowledge API is not enabled. Set KNOWLEDGE_API_KEY in backend/.env." },
      503,
    );
  }

  const header = c.req.header("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented || !keysMatch(presented, env.KNOWLEDGE_API_KEY)) {
    c.header("WWW-Authenticate", 'Bearer realm="knowledge"');
    return c.json({ error: "Invalid or missing API key." }, 401);
  }

  await next();
};

function keysMatch(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}
