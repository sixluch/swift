import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq, lt } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";

/**
 * Password hashing and session handling for the admin console.
 *
 * scrypt comes from Node itself: no native build step (bcrypt and argon2 both
 * need one, which is a recurring problem on Windows) and no dependency to keep
 * patched. Sessions are opaque tokens in a table rather than JWTs so that
 * signing out and revoking access are real operations, not expiry guesses.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

export const ADMIN_COOKIE = "sb_admin";

export interface AdminIdentity {
  id: string;
  username: string;
}

/** Hono env for every route behind `requireAdmin`. */
export type AdminEnv = { Variables: { admin: AdminIdentity } };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(
    password.normalize("NFKC"),
    Buffer.from(saltHex, "hex"),
    expected.length || KEY_LENGTH,
  );
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(adminUserId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.ADMIN_SESSION_HOURS * 60 * 60 * 1000);

  await db
    .insert(schema.adminSessions)
    .values({ adminUserId, tokenHash: hashToken(token), expiresAt });

  // Opportunistic sweep — there is no scheduler in this app, and expired rows
  // are useless once the index has been consulted.
  await db.delete(schema.adminSessions).where(lt(schema.adminSessions.expiresAt, new Date()));

  return { token, expiresAt };
}

export async function resolveSession(token: string): Promise<AdminIdentity | null> {
  const [row] = await db
    .select({
      id: schema.adminUsers.id,
      username: schema.adminUsers.username,
      expiresAt: schema.adminSessions.expiresAt,
    })
    .from(schema.adminSessions)
    .innerJoin(schema.adminUsers, eq(schema.adminUsers.id, schema.adminSessions.adminUserId))
    .where(eq(schema.adminSessions.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await destroySession(token);
    return null;
  }

  return { id: row.id, username: row.username };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(schema.adminSessions).where(eq(schema.adminSessions.tokenHash, hashToken(token)));
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  setCookie(c, ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: env.ADMIN_COOKIE_SECURE,
    // Frontend and API share a registrable domain, so Lax is same-site here and
    // still covers the plain <a> navigation the CSV download uses.
    sameSite: "Lax",
    path: "/",
    domain: env.ADMIN_COOKIE_DOMAIN || undefined,
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, ADMIN_COOKIE, {
    path: "/",
    domain: env.ADMIN_COOKIE_DOMAIN || undefined,
  });
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, ADMIN_COOKIE);
}

/**
 * The backend is the authority on access — the admin UI's redirect is only
 * convenience, so every data route sits behind this.
 */
export const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const token = readSessionCookie(c);
  if (!token) return c.json({ error: "Please sign in." }, 401);

  const admin = await resolveSession(token);
  if (!admin) {
    clearSessionCookie(c);
    return c.json({ error: "Your session has expired. Please sign in again." }, 401);
  }

  c.set("admin", admin);
  return next();
};
