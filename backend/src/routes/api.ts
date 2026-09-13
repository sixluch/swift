import { generateText, type ModelMessage } from "ai";
import { Hono } from "hono";
import { chatModel } from "../lib/ai/model.js";
import { buildKnowledgePrompt } from "../lib/ai/prompt.js";
import { requireApiKey } from "../lib/api-key.js";
import { fieldErrors } from "../lib/http.js";
import {
  findInsurerKnowledge,
  getGeneralKnowledge,
  listInsurerKnowledge,
} from "../lib/knowledge.js";
import { askSchema } from "../lib/validation.js";

/**
 * Machine-facing knowledge API, for the voice AI and for testing from Postman.
 * Bearer key on every route (`lib/api-key.ts`). Nothing here touches a lead
 * or a conversation, and nothing is persisted — the caller owns its own
 * transcript and passes it back as `history` if it wants continuity.
 */
export const apiRoute = new Hono();

apiRoute.use("*", requireApiKey);

/** Every company's knowledge base plus the general one, as raw text. */
apiRoute.get("/knowledge", async (c) => {
  const names = (c.req.query("insurers") ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const includeEmpty = c.req.query("include") === "empty";

  const [general, insurers] = await Promise.all([
    getGeneralKnowledge(),
    listInsurerKnowledge({ names, includeEmpty }),
  ]);
  return c.json({ general, insurers });
});

/** One company by name or id, e.g. `/api/knowledge/insurers/VUMI`. */
apiRoute.get("/knowledge/insurers/:ref", async (c) => {
  const insurer = await findInsurerKnowledge(c.req.param("ref"));
  if (!insurer) return c.json({ error: "Unknown insurance company." }, 404);
  return c.json(insurer);
});

/**
 * Ask the assistant a question and get the whole answer as JSON — the
 * non-streaming counterpart of `/chat`, grounded in the knowledge base alone.
 */
apiRoute.post("/ask", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }
  const { question, insurers: wanted, history } = parsed.data;

  let model: string;
  try {
    model = chatModel();
  } catch (err) {
    console.error("[POST /api/ask] model unavailable:", err);
    return c.json({ error: "The assistant is not configured yet." }, 503);
  }

  const [general, insurers] = await Promise.all([
    getGeneralKnowledge(),
    listInsurerKnowledge({ names: wanted }),
  ]);
  const system = buildKnowledgePrompt({
    general,
    insurers: insurers.map((i) => ({ name: i.name, text: i.knowledgeBase })),
  });

  const messages: ModelMessage[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  try {
    const result = await generateText({ model, system, messages });
    return c.json({
      answer: result.text.trim(),
      insurers: insurers.map((i) => i.name),
      model,
      usage: {
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
      },
    });
  } catch (err) {
    console.error("[POST /api/ask] gateway call failed:", err);
    return c.json({ error: "The assistant is unavailable right now." }, 502);
  }
});
