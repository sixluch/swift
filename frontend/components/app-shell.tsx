"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { LeadGate } from "@/components/lead-gate";
import { ResultsPanel } from "@/components/results-panel";
import { SiteHeader, type ChatMode } from "@/components/site-header";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { config } from "@/lib/config";
import type { CoverageType } from "@/lib/coverage";
import { useLead } from "@/lib/lead-context";
import type { ChatMessage, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";

type MobileTab = "chat" | "matches";

const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  content: `Hey! I'm ${config.assistantName} 👋 I'll find you the best health insurance plans in seconds. What's your name?`,
};

export function AppShell() {
  const { isUnlocked } = useLead();
  const [mode, setMode] = useState<ChatMode>("chat");
  const [tab, setTab] = useState<MobileTab>("chat");
  const [coverage, setCoverage] = useState<CoverageType[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [quotes] = useState<Quote[]>([]);

  function toggleCoverage(id: CoverageType) {
    setCoverage((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  }

  // Phase 2 is UI-only: the send button echoes a placeholder reply.
  // Phase 4 replaces this with the streaming /chat call.
  function handleSend(text: string) {
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: text, inputMode: "typed" },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Thanks! I'll be able to answer properly once I'm connected in Phase 4.",
      },
    ]);
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-navy-900 text-white">
      <div className="h-0.5 w-full shrink-0 bg-brand" />
      <SiteHeader mode={mode} onModeChange={setMode} />

      {/* Mobile: one panel at a time. lg and up: the two-panel split from §10. */}
      <div className="flex shrink-0 gap-1 border-b border-white/5 px-4 py-2 lg:hidden">
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
          Chat
        </TabButton>
        <TabButton active={tab === "matches"} onClick={() => setTab("matches")}>
          Matches{coverage.length > 0 ? ` · ${coverage.length}` : ""}
        </TabButton>
      </div>

      <main className="flex min-h-0 flex-1 lg:divide-x lg:divide-white/5">
        <div className={cn("min-h-0 flex-1 lg:flex", tab === "chat" ? "flex" : "hidden")}>
          <ChatPanel messages={messages} locked={!isUnlocked} mode={mode} onSend={handleSend} />
        </div>
        <div className={cn("min-h-0 flex-1 lg:flex", tab === "matches" ? "flex" : "hidden")}>
          <ResultsPanel selected={coverage} onToggle={toggleCoverage} quotes={quotes} />
        </div>
      </main>

      <WhatsappFab />
      {!isUnlocked && <LeadGate />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-navy-800 text-white" : "text-slate-400 hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}
