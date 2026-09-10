/**
 * Creates (or resets the password of) the single admin console account.
 *
 *   npm run admin:create -- <username>
 *
 * The password is read from stdin, or from ADMIN_PASSWORD when scripted. It is
 * deliberately not an argv parameter: argv lands in shell history and in `ps`.
 * There is no default account and no seeded password anywhere in this repo.
 */
import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { hashPassword } from "../lib/admin-auth.js";

const MIN_LENGTH = 12;

const username = process.argv[2]?.trim();
if (!username) {
  console.error("Usage: npm run admin:create -- <username>");
  process.exit(1);
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    // Node has no portable way to hide terminal input here; the prompt says so.
    const answer = await rl.question(
      `Password for "${username}" (min ${MIN_LENGTH} chars, will be visible): `,
    );
    return answer;
  } finally {
    rl.close();
  }
}

const password = (await readPassword()).trim();

if (password.length < MIN_LENGTH) {
  console.error(`Password must be at least ${MIN_LENGTH} characters.`);
  process.exit(1);
}

const passwordHash = await hashPassword(password);

const existing = await db.select().from(schema.adminUsers);
const match = existing.find((u) => u.username === username);

if (match) {
  await db
    .update(schema.adminUsers)
    .set({ passwordHash })
    .where(eq(schema.adminUsers.id, match.id));
  // Force a fresh sign-in everywhere — a password reset that leaves old
  // sessions alive isn't a reset.
  await db.delete(schema.adminSessions).where(eq(schema.adminSessions.adminUserId, match.id));
  console.log(`Password updated for "${username}". All existing sessions were signed out.`);
} else {
  if (existing.length > 0) {
    console.warn(
      `Note: ${existing.length} admin account(s) already exist (${existing
        .map((u) => u.username)
        .join(", ")}). This adds another.`,
    );
  }
  await db.insert(schema.adminUsers).values({ username, passwordHash });
  console.log(`Admin "${username}" created.`);
}

process.exit(0);
