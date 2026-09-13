import { Hono } from "hono";
import type { AdminEnv } from "../lib/admin-auth.js";
import { fieldErrors } from "../lib/http.js";
import { applySectionEdits, getRateCard } from "../lib/rate-cards/store.js";
import { sectionEditsSchema } from "../lib/validation.js";

/** Reading and hand-editing a parsed rate card. Mounted under `/admin/rate-cards`. */
export const adminRateCardsRoute = new Hono<AdminEnv>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

adminRateCardsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Unknown rate card." }, 400);

  const card = await getRateCard(id);
  if (!card) return c.json({ error: "Unknown rate card." }, 404);

  return c.json(card);
});

adminRateCardsRoute.patch("/:id/sections", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Unknown rate card." }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const input = sectionEditsSchema.safeParse(body);
  if (!input.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(input.error) }, 400);
  }

  const card = await getRateCard(id);
  if (!card) return c.json({ error: "Unknown rate card." }, 404);

  try {
    // Every update is scoped to this rate card, so an id belonging to another
    // card is ignored rather than edited.
    const applied = await applySectionEdits(id, input.data.edits);
    return c.json({ applied, requested: input.data.edits.length });
  } catch (err) {
    console.error("[PATCH /admin/rate-cards/:id/sections] failed:", err);
    return c.json({ error: "Could not save those changes. Please try again." }, 500);
  }
});
