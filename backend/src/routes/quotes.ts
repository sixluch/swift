import { Hono } from "hono";
import {
  LeadNotFoundError,
  findOrCreateConversation,
  updateProfile,
} from "../lib/conversations.js";
import { fieldErrors } from "../lib/http.js";
import { priceForm, saveProfile, snapshotQuotes, type PricedForm } from "../lib/quote-flow.js";
import { getQuotes } from "../lib/quotes-api/index.js";
import {
  deliveryChoiceSchema,
  quoteFormSchema,
  quoteRequestSchema,
} from "../lib/validation.js";

export const quotesRoute = new Hono();

const SESSION_EXPIRED = "Your session expired. Please enter your details again.";

/**
 * The quote form's COMPARE button. One call does the three things that belong
 * together (`lib/quote-flow.ts`): the submitted profile becomes the lead's
 * conversation profile (the admin report reads it), the provider is asked to
 * price it, and the result is snapshotted on quote_requests — which is also
 * what the support chat reads back, so the model can only discuss quotes that
 * were actually shown.
 *
 * Re-submitting overwrites the profile and adds another snapshot; the history
 * of what was asked is the snapshots, not the profile.
 */
quotesRoute.post("/request", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = quoteFormSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }

  const { leadId, ...form } = parsed.data;

  let conversationId: string;
  try {
    conversationId = await saveProfile(leadId, form);
  } catch (err) {
    if (err instanceof LeadNotFoundError) return c.json({ error: SESSION_EXPIRED }, 404);
    console.error("[POST /quotes/request] could not persist the profile:", err);
    return c.json({ error: "Something went wrong. Please try again." }, 500);
  }

  let priced: PricedForm;
  try {
    priced = await priceForm(form);
  } catch (err) {
    console.error("[POST /quotes/request] provider failed:", err);
    return c.json({ error: "Could not fetch quotations. Please try again." }, 502);
  }

  try {
    await snapshotQuotes(conversationId, form, priced);
  } catch (err) {
    // A logging failure must not cost the visitor their quotes.
    console.error("[POST /quotes/request] could not snapshot the quote request:", err);
  }

  return c.json({ quotes: priced.quotes, notices: priced.notices });
});

/** Records which channel the visitor picked for the comparison. Nothing is sent. */
quotesRoute.post("/delivery", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = deliveryChoiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }

  try {
    const conversationId = await findOrCreateConversation(parsed.data.leadId);
    await updateProfile(conversationId, { deliveryChannel: parsed.data.channel });
    return c.json({ ok: true, channel: parsed.data.channel });
  } catch (err) {
    if (err instanceof LeadNotFoundError) return c.json({ error: SESSION_EXPIRED }, 404);
    console.error("[POST /quotes/delivery] could not persist the choice:", err);
    return c.json({ error: "Something went wrong. Please try again." }, 500);
  }
});

/**
 * Stateless REST surface over the same provider call — nothing is persisted,
 * no lead is needed. Kept so the pricing can be exercised with curl alone.
 */
quotesRoute.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }

  try {
    const { quotes, notices } = await getQuotes(parsed.data);
    return c.json({ quotes, notices });
  } catch (err) {
    console.error("[POST /quotes] provider failed:", err);
    return c.json({ error: "Could not fetch quotations. Please try again." }, 502);
  }
});
