import { Hono } from "hono";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { chatModel } from "../lib/ai/model.js";
import { buildSystemPrompt } from "../lib/ai/prompt.js";
import { buildTools } from "../lib/ai/tools.js";
import {
  LeadNotFoundError,
  findOrCreateConversation,
  saveMessage,
} from "../lib/conversations.js";
import { fieldErrors } from "../lib/http.js";
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

  const { leadId, coverageTypes, inputMode } = parsed.data;
  const messages = parsed.data.messages as unknown as UIMessage[];

  let model: string;
  try {
    model = chatModel();
  } catch (err) {
    console.error("[POST /chat] model unavailable:", err);
    return c.json({ error: "The assistant is not configured yet." }, 503);
  }

  let conversationId: string;
  try {
    conversationId = await findOrCreateConversation(leadId, coverageTypes);

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
      system: buildSystemPrompt(coverageTypes),
      messages: await convertToModelMessages(messages),
      tools: buildTools(conversationId, coverageTypes),
      // Let the model speak again after the tool returns, instead of ending on raw data.
      stopWhen: stepCountIs(4),
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
