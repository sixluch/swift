import { Hono } from "hono";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { chatModel } from "../lib/ai/model.js";
import { buildSystemPrompt } from "../lib/ai/prompt.js";
import {
  LeadNotFoundError,
  findOrCreateConversation,
  getProfile,
  latestQuotes,
  saveMessage,
} from "../lib/conversations.js";
import { fieldErrors } from "../lib/http.js";
import { getKnowledge } from "../lib/knowledge.js";
import { chatRequestSchema } from "../lib/validation.js";

export const chatRoute = new Hono();

/** Pulls the plain text out of a UIMessage's parts for persistence. */
function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

/**
 * Support chat. The model has no tools: the quote form is the only thing that
 * changes the profile or the quotes, and both are read from the database here
 * — never from the request — so the model can only talk about what was
 * actually shown to this visitor.
 */
chatRoute.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }

  const { leadId, inputMode } = parsed.data;
  const messages = parsed.data.messages as unknown as UIMessage[];

  let model: string;
  try {
    model = chatModel();
  } catch (err) {
    console.error("[POST /chat] model unavailable:", err);
    return c.json({ error: "The assistant is not configured yet." }, 503);
  }

  let conversationId: string;
  let system: string;
  try {
    conversationId = await findOrCreateConversation(leadId);

    const [profile, shown] = await Promise.all([
      getProfile(conversationId),
      latestQuotes(conversationId),
    ]);
    // Insurer knowledge depends on which insurers were quoted, hence the second round.
    const knowledge = await getKnowledge(shown.quotes);
    system = buildSystemPrompt({
      profile,
      quotes: shown.quotes,
      notices: shown.notices,
      knowledge,
    });

    const latest = messages[messages.length - 1];
    if (latest?.role === "user") {
      await saveMessage({
        conversationId,
        role: "user",
        content: messageText(latest),
        inputMode,
      });
    }
  } catch (err) {
    if (err instanceof LeadNotFoundError) {
      return c.json({ error: "Your session expired. Please enter your details again." }, 404);
    }
    console.error("[POST /chat] could not persist the incoming message:", err);
    return c.json({ error: "Something went wrong. Please try again." }, 500);
  }

  try {
    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(messages),
      onError: ({ error }) => console.error("[POST /chat] stream failed:", error),
      onFinish: async ({ text }) => {
        if (!text.trim()) return;
        try {
          await saveMessage({ conversationId, role: "assistant", content: text });
        } catch (err) {
          console.error("[POST /chat] could not persist the reply:", err);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[POST /chat] gateway call failed:", err);
    return c.json({ error: "The assistant is unavailable right now." }, 502);
  }
});
