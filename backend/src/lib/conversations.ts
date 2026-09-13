import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import {
  EMPTY_PROFILE,
  coverageForTier,
  type CoverageTier,
  type DeliveryChannel,
  type Gender,
  type Profile,
} from "./profile.js";
import type { Quote } from "./quotes-api/types.js";

/** Thrown when the client sends a leadId that is not in the database (e.g. a stale session). */
export class LeadNotFoundError extends Error {
  constructor() {
    super('Lead not found');
    this.name = 'LeadNotFoundError';
  }
}

/** One conversation per lead: reuse the latest, create it on the first message. */
export async function findOrCreateConversation(leadId: string): Promise<string> {
  const [lead] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(eq(schema.leads.id, leadId))
    .limit(1);

  if (!lead) throw new LeadNotFoundError();

  const [existing] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.leadId, leadId))
    .orderBy(desc(schema.conversations.startedAt))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.conversations)
    .values({ leadId })
    .returning({ id: schema.conversations.id });

  return created.id;
}

/** Reads the profile the form last submitted for this conversation. */
export async function getProfile(conversationId: string): Promise<Profile> {
  const [row] = await db
    .select({
      fullName: schema.conversations.fullName,
      country: schema.conversations.country,
      nationality: schema.conversations.nationality,
      age: schema.conversations.age,
      gender: schema.conversations.gender,
      effectiveDate: schema.conversations.effectiveDate,
      dependants: schema.conversations.dependants,
      coverageTier: schema.conversations.coverageTier,
      deliveryChannel: schema.conversations.deliveryChannel,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);

  if (!row) return { ...EMPTY_PROFILE, dependants: [] };

  return {
    ...EMPTY_PROFILE,
    ...row,
    gender: (row.gender as Gender | null) ?? null,
    dependants: Array.isArray(row.dependants) ? row.dependants : [],
    coverageTier: (row.coverageTier as CoverageTier | null) ?? null,
    deliveryChannel: (row.deliveryChannel as DeliveryChannel | null) ?? null,
  };
}

/**
 * Merges fields into the stored profile and returns the result. Only keys that
 * are actually present are written, so recording a delivery preference never
 * blanks the form answers, and vice versa.
 */
export async function updateProfile(
  conversationId: string,
  patch: Partial<Profile>,
): Promise<Profile> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return getProfile(conversationId);

  const update: Record<string, unknown> = Object.fromEntries(entries);

  // The chips and the CRM export read coverage_type, so keep it derived from the
  // tier rather than letting the two drift apart.
  if ("coverageTier" in update) {
    update.coverageType = coverageForTier(update.coverageTier as CoverageTier | null);
  }

  await db
    .update(schema.conversations)
    .set(update)
    .where(eq(schema.conversations.id, conversationId));

  return getProfile(conversationId);
}

/**
 * The quotes currently on the visitor's screen: the most recent snapshot the
 * form produced. The chat reads this rather than trusting anything the client
 * sends, so the model can only ever discuss prices that were actually quoted.
 */
export async function latestQuotes(
  conversationId: string,
): Promise<{ quotes: Quote[]; notices: string[] }> {
  const [row] = await db
    .select({
      quotes: schema.quoteRequests.quotesReturned,
      notices: schema.quoteRequests.notices,
    })
    .from(schema.quoteRequests)
    .where(eq(schema.quoteRequests.conversationId, conversationId))
    .orderBy(desc(schema.quoteRequests.createdAt))
    .limit(1);
  return {
    quotes: Array.isArray(row?.quotes) ? (row.quotes as Quote[]) : [],
    notices: Array.isArray(row?.notices) ? row.notices : [],
  };
}

export async function saveMessage(params: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  inputMode?: "typed" | "voice";
}): Promise<void> {
  await db.insert(schema.messages).values({
    conversationId: params.conversationId,
    role: params.role,
    content: params.content,
    inputMode: params.inputMode ?? null,
  });
}
