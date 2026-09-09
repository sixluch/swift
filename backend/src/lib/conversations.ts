import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { CoverageType } from "./quotes-api/types.js";

/** Thrown when the client sends a leadId that is not in the database (e.g. a stale session). */
export class LeadNotFoundError extends Error {
  constructor() {
    super('Lead not found');
    this.name = 'LeadNotFoundError';
  }
}

/** One conversation per lead: reuse the latest, create it on the first message. */
export async function findOrCreateConversation(
  leadId: string,
  coverageTypes: CoverageType[],
): Promise<string> {
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

  if (existing) {
    // Chips can be toggled mid-conversation, so keep the stored selection current.
    await db
      .update(schema.conversations)
      .set({ coverageType: coverageTypes })
      .where(eq(schema.conversations.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(schema.conversations)
    .values({ leadId, coverageType: coverageTypes })
    .returning({ id: schema.conversations.id });

  return created.id;
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
