"use client";

import { useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { track } from "./analytics";
import { config } from "./config";
import type { CoverageType } from "./coverage";
import type { InputMode, Quote } from "./types";

/** Rendered as the opening bubble and sent as history, so the AI knows it already greeted. */
export const GREETING: UIMessage = {
  id: "greeting",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: `Hey! I'm ${config.assistantName} 👋 I'll find you the best health insurance plans in seconds. What's your name?`,
    },
  ],
};

export function messageText(message: UIMessage): string {
  // A tool-calling turn produces one text part before the call and one after —
  // joining them bare would run two sentences together.
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Pulls the latest getQuotes tool output out of the message stream. */
export function extractQuotes(messages: UIMessage[]): Quote[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const part of messages[i].parts) {
      if (part.type !== "tool-getQuotes") continue;
      if (!("state" in part) || part.state !== "output-available") continue;
      const output = part.output as { quotes?: Quote[] } | undefined;
      if (output?.quotes?.length) return output.quotes;
    }
  }
  return [];
}

/**
 * The age the AI last asked for quotes with. The chip-driven preview reuses it
 * so both surfaces price the same applicant.
 */
export function extractQuotedAge(messages: UIMessage[]): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const part of messages[i].parts) {
      if (part.type !== "tool-getQuotes") continue;
      const input = "input" in part ? (part.input as { age?: unknown } | undefined) : undefined;
      if (typeof input?.age === "number") return input.age;
    }
  }
  return undefined;
}

/** True while the tool is running, so the panel can show a loading state. */
export function isFetchingQuotes(messages: UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last) return false;
  return last.parts.some(
    (part) =>
      part.type === "tool-getQuotes" &&
      "state" in part &&
      (part.state === "input-streaming" || part.state === "input-available"),
  );
}

interface UseBrokerChatArgs {
  leadId: string | null;
  coverageTypes: CoverageType[];
  /** Called when the backend reports the lead no longer exists. */
  onSessionExpired: () => void;
}

/**
 * Wraps useChat so the rest of the UI never touches transport details.
 * Coverage selection travels with every request as context for the system prompt.
 */
export function useBrokerChat({
  leadId,
  coverageTypes,
  onSessionExpired,
}: UseBrokerChatArgs) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: `${config.backendUrl}/chat` }),
    [],
  );

  const { messages, sendMessage, status, error, regenerate } = useChat({
    transport,
    messages: [GREETING],
    onError: (err) => {
      // The backend answers 404 with this wording when the leadId is unknown,
      // which happens whenever the database is reset under a live tab.
      if (/session expired/i.test(err.message)) onSessionExpired();
    },
  });

  const send = useCallback(
    (text: string, inputMode: InputMode = "typed") => {
      if (!leadId) return;
      track({ name: "message_sent", inputMode });
      void sendMessage({ text }, { body: { leadId, coverageTypes, inputMode } });
    },
    [leadId, coverageTypes, sendMessage],
  );

  const retry = useCallback(() => {
    if (!leadId) return;
    void regenerate({ body: { leadId, coverageTypes, inputMode: "typed" } });
  }, [leadId, coverageTypes, regenerate]);

  return {
    messages,
    quotes: extractQuotes(messages),
    quotedAge: extractQuotedAge(messages),
    fetchingQuotes: isFetchingQuotes(messages),
    send,
    retry,
    isBusy: status === "submitted" || status === "streaming",
    error,
  };
}
