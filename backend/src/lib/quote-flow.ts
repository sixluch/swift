import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { findOrCreateConversation, updateProfile } from "./conversations.js";
import { coverageForTier, dependantAges } from "./profile.js";
import { getQuotes } from "./quotes-api/index.js";
import type { CoverageType, Quote } from "./quotes-api/types.js";
import type { QuoteFormInput } from "./validation.js";

/**
 * The COMPARE flow, shared by the web form (`POST /quotes/request`) and the
 * voice AI (`POST /api/quotes`) so a quote from either channel is priced and
 * recorded identically. Three steps that the routes sequence themselves,
 * because their error handling differs (a web visitor gets "session expired",
 * a machine caller gets a field error):
 *
 *   saveProfile → priceForm → snapshotQuotes
 *
 * The profile is saved *before* pricing on purpose: a submission the provider
 * then fails on is still a lead who told us what they want.
 */
export type QuoteForm = Omit<QuoteFormInput, "leadId">;

export interface PricedForm {
  quotes: Quote[];
  notices: string[];
  coverageTypes: CoverageType[];
}

/** Writes the form onto the lead's conversation; throws LeadNotFoundError. */
export async function saveProfile(leadId: string, form: QuoteForm): Promise<string> {
  const conversationId = await findOrCreateConversation(leadId);
  await updateProfile(conversationId, form);
  return conversationId;
}

export async function priceForm(form: QuoteForm): Promise<PricedForm> {
  const coverageTypes = coverageForTier(form.coverageTier);
  const { quotes, notices } = await getQuotes({
    name: form.fullName,
    age: form.age,
    coverageTypes,
    country: form.country,
    additionalAges: dependantAges(form.dependants),
  });
  return { quotes, notices: notices ?? [], coverageTypes };
}

/** One row per COMPARE — the history of what was asked, and what the chat reads. */
export async function snapshotQuotes(
  conversationId: string,
  form: QuoteForm,
  priced: PricedForm,
): Promise<void> {
  await db.insert(schema.quoteRequests).values({
    conversationId,
    name: form.fullName,
    age: form.age,
    coverageType: priced.coverageTypes,
    quotesReturned: priced.quotes,
    notices: priced.notices,
    profile: form,
  });
}

/**
 * The lead for a machine-channel caller. The web gate creates a fresh lead on
 * every visit; here the caller identifies the person by email, so the most
 * recent lead with that email (and the same source) is reused and their
 * quotes accumulate on one record rather than fragmenting across many.
 */
export async function findOrCreateLead(contact: {
  email: string;
  phone: string;
  source: string;
}): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.email, contact.email), eq(schema.leads.source, contact.source)))
    .orderBy(desc(schema.leads.createdAt))
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const [lead] = await db
    .insert(schema.leads)
    .values({ email: contact.email, phone: contact.phone, source: contact.source })
    .returning({ id: schema.leads.id });
  return { id: lead.id, created: true };
}
