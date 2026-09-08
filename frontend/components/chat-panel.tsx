"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { ChatBubble } from "@/components/chat-bubble";
import { cn } from "@/lib/utils";
import { config } from "@/lib/config";
import type { ChatMessage } from "@/lib/types";
import type { ChatMode } from "@/components/site-header";

interface ChatPanelProps {
  messages: ChatMessage[];
  locked: boolean;
  mode: ChatMode;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, locked, mode, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || locked) return;
    onSend(text);
    setDraft("");
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-navy-900" aria-label="Chat">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="shrink-0 px-4 pt-2 pb-4 sm:px-6 sm:pb-6">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border border-white/10 bg-navy-800 py-1.5 pr-1.5 pl-1.5",
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

          {/* Speak mode is wired to the Web Speech API in Phase 6. */}
          {mode === "speak" && <Mic aria-hidden className="size-4 shrink-0 text-brand" />}

          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={locked}
            aria-label="Message"
            placeholder={
              locked
                ? "Add your details to start"
                : mode === "speak"
                  ? "Tap the mic or type…"
                  : "Type your answer…"
            }
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
          />

          <button
            type="submit"
            disabled={locked || draft.trim().length === 0}
            aria-label="Send message"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-navy-950 transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
