"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { LeadGate } from "@/components/lead-gate";
import { ResultsPanel } from "@/components/results-panel";
import { SiteHeader, type ChatMode } from "@/components/site-header";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { track } from "@/lib/analytics";
import type { CoverageType } from "@/lib/coverage";
import { useLead } from "@/lib/lead-context";
import { useBrokerChat } from "@/lib/use-broker-chat";
import { useCoverageQuotes } from "@/lib/use-coverage-quotes";
import { cn } from "@/lib/utils";

type MobileTab = "chat" | "matches";

export function AppShell() {
  const { leadId, isUnlocked, clearLead } = useLead();
  const [mode, setMode] = useState<ChatMode>("chat");
  const [tab, setTab] = useState<MobileTab>("chat");
  const [coverage, setCoverage] = useState<CoverageType[]>([]);

  const {
    messages,
    quotes: chatQuotes,
    quotedAge,
    fetchingQuotes,
    send,
    retry,
    isBusy,
    error,
  } = useBrokerChat({
    leadId,
    coverageTypes: coverage,
    onSessionExpired: clearLead,
  });

  const preview = useCoverageQuotes({ coverageTypes: coverage, age: quotedAge });

  // Selecting a chip is a direct request to see that market, so it drives the
  // panel; with nothing selected, the panel follows the conversation. Once the
  // AI has quoted, both are priced off the same age and agree.
  const usingPreview = coverage.length > 0;
  const quotes = usingPreview ? preview.quotes : chatQuotes;
  const loading = usingPreview ? preview.loading : fetchingQuotes;

  // On mobile the results panel is behind a tab — surface it when quotes land.
  const announced = useRef(0);
  useEffect(() => {
    if (quotes.length > 0 && quotes.length !== announced.current) {
      announced.current = quotes.length;
      track({
        name: "quotes_shown",
        count: quotes.length,
        cheapest: Math.min(...quotes.map((q) => q.monthlyPremium)),
      });
      setTab("matches");
    }
  }, [quotes]);

  // Browsers without the Web Speech API drop back to typing with a note.
  const [voiceUnsupported, setVoiceUnsupported] = useState(false);
  const handleVoiceUnsupported = useCallback(() => {
    track({ name: "voice_unsupported" });
    setVoiceUnsupported(true);
    setMode("chat");
  }, []);

  function toggleCoverage(id: CoverageType) {
    setCoverage((current) => {
      const next = current.includes(id)
        ? current.filter((c) => c !== id)
        : [...current, id];
      track({ name: "coverage_selected", coverageTypes: next });
      return next;
    });
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-navy-900 text-white">
      <div className="h-0.5 w-full shrink-0 bg-brand" />
      <SiteHeader mode={mode} onModeChange={setMode} />

      {voiceUnsupported && (
        <p className="shrink-0 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200 sm:px-6">
          Voice input isn&apos;t supported in this browser — try Chrome, or keep typing.
        </p>
      )}

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
        <div
          className={cn(
            // Chat is the narrower column; the results grid needs the room.
            "min-h-0 flex-1 lg:w-[26%] lg:max-w-[520px] lg:min-w-[340px] lg:flex-none lg:flex",
            tab === "chat" ? "flex" : "hidden",
          )}
        >
          <ChatPanel
            messages={messages}
            locked={!isUnlocked}
            isBusy={isBusy}
            error={error}
            mode={mode}
            onSend={send}
            onRetry={retry}
            onVoiceUnsupported={handleVoiceUnsupported}
          />
        </div>
        <div className={cn("min-h-0 flex-1 lg:flex", tab === "matches" ? "flex" : "hidden")}>
          <ResultsPanel
            selected={coverage}
            onToggle={toggleCoverage}
            quotes={quotes}
            loading={loading}
            error={usingPreview ? preview.error : null}
            indicative={usingPreview && quotedAge === undefined}
          />
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
