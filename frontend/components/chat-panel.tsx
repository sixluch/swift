"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, RotateCw } from "lucide-react";
import type { UIMessage } from "ai";
import { ChatBubble } from "@/components/chat-bubble";
import { TypingIndicator } from "@/components/typing-indicator";
import { VoiceBar } from "@/components/voice-bar";
import { cn } from "@/lib/utils";
import { config } from "@/lib/config";
import type { InputMode } from "@/lib/types";
import { messageText } from "@/lib/use-broker-chat";
import { useSpeechInput } from "@/lib/use-speech-input";
import type { ChatMode } from "@/components/site-header";

interface ChatPanelProps {
  messages: UIMessage[];
  locked: boolean;
  isBusy: boolean;
  error?: Error;
  mode: ChatMode;
  onSend: (text: string, inputMode: InputMode) => void;
  onRetry: () => void;
  onVoiceUnsupported: () => void;
}

export function ChatPanel({
  messages,
  locked,
  isBusy,
  error,
  mode,
  onSend,
  onRetry,
  onVoiceUnsupported,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const handleVoiceSend = useCallback(
    (text: string) => onSend(text, "voice"),
    [onSend],
  );

  const speech = useSpeechInput({ onAutoSend: handleVoiceSend });
  const speaking = mode === "speak";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isBusy]);

  // Leaving Speak mode (or locking the chat) must release the microphone.
  useEffect(() => {
    if ((!speaking || locked) && speech.listening) speech.stop();
  }, [speaking, locked, speech]);

  // Tell the shell when this browser can't do voice, so it can fall back to Chat.
  useEffect(() => {
    if (speaking && speech.supported === false) onVoiceUnsupported();
  }, [speaking, speech.supported, onVoiceUnsupported]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || locked || isBusy) return;
    onSend(text, "typed");
    setDraft("");
  }

  const last = messages[messages.length - 1];
  const awaitingFirstToken =
    isBusy && (last?.role !== "assistant" || messageText(last).length === 0);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-navy-900" aria-label="Chat">
      <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((message) => {
          const text = messageText(message);
          if (!text) return null;
          return <ChatBubble key={message.id} role={message.role} text={text} />;
        })}

        {awaitingFirstToken && <TypingIndicator />}

        {error && (
          <div className="flex w-full justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
              Something went wrong reaching {config.assistantName}.
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-500/25"
              >
                <RotateCw className="size-3" />
                Try again
              </button>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="shrink-0 px-4 pt-2 pb-4 sm:px-6 sm:pb-6">
        {speaking && speech.error && (
          <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {speech.error}
          </p>
        )}

        <form onSubmit={submit}>
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border bg-navy-800 p-1.5",
              speech.listening ? "border-brand/50" : "border-white/10",
              locked && "opacity-60",
            )}
          >
            <div
              aria-hidden
              title={config.assistantName}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white"
            >
              {config.assistantName.charAt(0)}
            </div>

            {speaking && speech.supported ? (
              <VoiceBar
                listening={speech.listening}
                pendingSend={speech.pendingSend}
                liveText={speech.liveText}
                onToggle={speech.toggle}
                onCancel={speech.cancelPending}
                disabled={locked || isBusy}
              />
            ) : (
              <>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={locked}
                  aria-label="Message"
                  placeholder={locked ? "Add your details to start" : `Ask ${config.assistantName} anything…`}
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
                />
                <button
                  type="submit"
                  disabled={locked || isBusy || draft.trim().length === 0}
                  aria-label="Send message"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-navy-950 transition-opacity disabled:opacity-40"
                >
                  <ArrowUp className="size-4" />
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
