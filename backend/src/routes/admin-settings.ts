import { Hono } from "hono";
import type { AdminEnv } from "../lib/admin-auth.js";
import { fieldErrors } from "../lib/http.js";
import {
  KNOWLEDGE_BASE_MAX_CHARS,
  getGeneralKnowledge,
  setGeneralKnowledge,
} from "../lib/knowledge.js";
import { generalKnowledgeSchema } from "../lib/validation.js";

/**
 * Console-wide settings. Mounted under `/admin/settings`, behind `requireAdmin`.
 * Today that is the general knowledge base the chat receives on every message
 * (per-insurer text lives on the insurer itself).
 */
export const adminSettingsRoute = new Hono<AdminEnv>();

adminSettingsRoute.get("/knowledge-base", async (c) => {
  return c.json({ knowledgeBase: await getGeneralKnowledge(), maxChars: KNOWLEDGE_BASE_MAX_CHARS });
});

adminSettingsRoute.put("/knowledge-base", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = generalKnowledgeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }

  try {
    await setGeneralKnowledge(parsed.data.knowledgeBase);
    return c.json({ knowledgeBase: parsed.data.knowledgeBase, maxChars: KNOWLEDGE_BASE_MAX_CHARS });
  } catch (err) {
    console.error("[PUT /admin/settings/knowledge-base] save failed:", err);
    return c.json({ error: "Could not save the knowledge base. Please try again." }, 500);
  }
});
