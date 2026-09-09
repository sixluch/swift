import { Hono } from "hono";
import { getQuotes } from "../lib/quotes-api/index.js";
import { fieldErrors } from "../lib/http.js";
import { quotePreviewSchema, quoteRequestSchema } from "../lib/validation.js";

export const quotesRoute = new Hono();

/**
 * Indicative pricing for a coverage selection alone, so the results panel can
 * fill in the moment a chip is clicked. Age is optional; without it the mock
 * prices a mid-band applicant, and the UI labels the results as indicative.
 * Nothing is persisted here — only the AI's getQuotes tool snapshots a request,
 * because only that one belongs to a conversation.
 */
const PREVIEW_AGE = 30;
const PREVIEW_NAME = "Guest";

quotesRoute.post("/preview", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = quotePreviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }

  const age = parsed.data.age ?? PREVIEW_AGE;

  try {
    const { quotes } = await getQuotes({
      name: PREVIEW_NAME,
      age,
      coverageTypes: parsed.data.coverageTypes,
    });
    return c.json({ quotes, age, assumedAge: parsed.data.age === undefined });
  } catch (err) {
    console.error("[POST /quotes/preview] provider failed:", err);
    return c.json({ error: "Could not fetch quotations. Please try again." }, 502);
  }
});

/** Standalone REST surface for the same function the AI calls as a tool. */
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
    const { quotes } = await getQuotes(parsed.data);
    return c.json({ quotes });
  } catch (err) {
    console.error("[POST /quotes] provider failed:", err);
    return c.json({ error: "Could not fetch quotations. Please try again." }, 502);
  }
});
