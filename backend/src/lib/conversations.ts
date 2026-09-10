import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import {
  EMPTY_PROFILE,
  coverageForTier,
  type CoverageTier,
  type DeliveryChannel,
  type PlanType,
  type Profile,
} from "./profile.js";

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

/** Reads the answers collected so far for this conversation. */
export async function getProfile(conversationId: string): Promise<Profile> {
  const [row] = await db
    .select({
      fullName: schema.conversations.fullName,
      country: schema.conversations.country,
      nationality: schema.conversations.nationality,
      age: schema.conversations.age,
      planType: schema.conversations.planType,
      familyAges: schema.conversations.familyAges,
      coverageTier: schema.conversations.coverageTier,
      deliveryChannel: schema.conversations.deliveryChannel,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);

  if (!row) return { ...EMPTY_PROFILE };

  return {
    ...EMPTY_PROFILE,
    ...row,
    planType: (row.planType as PlanType | null) ?? null,
    coverageTier: (row.coverageTier as CoverageTier | null) ?? null,
    deliveryChannel: (row.deliveryChannel as DeliveryChannel | null) ?? null,
  };
}

/**
 * Merges answers into the stored profile and returns the result. Only keys that
 * are actually present are written, so a partial update never blanks a slot the
 * user already answered.
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

/** True once a quote request has been recorded for this conversation. */
export async function hasQuotes(conversationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.quoteRequests.id })
    .from(schema.quoteRequests)
    .where(eq(schema.quoteRequests.conversationId, conversationId))
    .limit(1);
  return Boolean(row);
}

/**
 * Pulls the ages out of a free-text answer like "partner 42, kids 10 and 7".
 * Anything outside a plausible human age is dropped rather than trusted.
 */
export function parseFamilyAges(text: string | null): number[] {
  if (!text) return [];
  return (text.match(/\d{1,3}/g) ?? [])
    .map(Number)
    .filter((age) => Number.isInteger(age) && age >= 0 && age <= 120)
    .slice(0, 10);
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
