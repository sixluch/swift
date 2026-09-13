"use client";

import { useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { track } from "./analytics";
import { config } from "./config";
import type { InputMode } from "./types";

/** Rendered as the opening bubble and sent as history, so the AI knows it already greeted. */
export const GREETING: UIMessage = {
  id: "greeting",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: `Hey! I'm ${config.assistantName} 👋 Fill in the form above and press Compare to see your plans — I'm here if you have any questions about the covers or the quotes.`,
    },
  ],
};

export function messageText(message: UIMessage): string {
  // Joining with a blank line keeps separate text parts from running together.
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

interface UseBrokerChatArgs {
  leadId: string | null;
  /** Called when the backend reports the lead no longer exists. */
  onSessionExpired: () => void;
}

/**
 * Wraps useChat so the rest of the UI never touches transport details. The
 * chat is support-only: the backend reads the submitted form and the quotes on
 * screen from the database, so nothing about them travels on this request.
 */
export function useBrokerChat({ leadId, onSessionExpired }: UseBrokerChatArgs) {
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
      void sendMessage({ text }, { body: { leadId, inputMode } });
    },
    [leadId, sendMessage],
  );

  const retry = useCallback(() => {
    if (!leadId) return;
    void regenerate({ body: { leadId, inputMode: "typed" } });
  }, [leadId, regenerate]);

  return {
    messages,
    send,
    retry,
    isBusy: status === "submitted" || status === "streaming",
    error,
  };
}
