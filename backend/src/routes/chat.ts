import { Hono } from "hono";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { chatModel } from "../lib/ai/model.js";
import { buildSystemPrompt } from "../lib/ai/prompt.js";
import { buildTools } from "../lib/ai/tools.js";
import {
  LeadNotFoundError,
  findOrCreateConversation,
  getProfile,
  hasQuotes,
  saveMessage,
  updateProfile,
} from "../lib/conversations.js";
import { isReadyForQuotes, nextSlot, type Profile } from "../lib/profile.js";
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

  const { leadId, slotAnswer, inputMode } = parsed.data;
  const messages = parsed.data.messages as unknown as UIMessage[];

  let model: string;
  try {
    model = chatModel();
  } catch (err) {
    console.error("[POST /chat] model unavailable:", err);
    return c.json({ error: "The assistant is not configured yet." }, 503);
  }

  let conversationId: string;
  let profile: Profile;
  let quotesShown: boolean;
  try {
    conversationId = await findOrCreateConversation(leadId);

    // A card or dropdown answer is applied here, before the model sees anything,
    // so the stored value is exactly what the user picked.
    profile = slotAnswer
      ? await updateProfile(conversationId, { [slotAnswer.slot]: slotAnswer.value })
      : await getProfile(conversationId);

    quotesShown = await hasQuotes(conversationId);

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

  // The tools mutate this as they save answers, so the prompt for the *next*
  // turn and the profile we stream back both reflect what actually landed.
  const profileRef = { current: profile };

  try {
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model,
          system: buildSystemPrompt({
            profile,
            next: nextSlot(profile, quotesShown),
            readyForQuotes: isReadyForQuotes(profile),
            quotesShown,
          }),
          messages: await convertToModelMessages(messages),
          tools: buildTools(conversationId, profileRef),
          // Let the model speak again after a tool returns, instead of ending on raw data.
          stopWhen: stepCountIs(6),
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

        writer.merge(result.toUIMessageStream());
        await result.finishReason;

        // Tell the interface which question is now outstanding, so it can render
        // the matching cards or dropdown under the reply.
        const latestProfile = profileRef.current;
        const showQuotes = quotesShown || (await hasQuotes(conversationId));
        writer.write({
          type: "data-profile",
          id: "profile",
          data: {
            profile: latestProfile,
            nextSlot: nextSlot(latestProfile, showQuotes),
            readyForQuotes: isReadyForQuotes(latestProfile),
          },
        });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    console.error("[POST /chat] gateway call failed:", err);
    return c.json({ error: "The assistant is unavailable right now." }, 502);
  }
});
