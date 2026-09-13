"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { LeadGate } from "@/components/lead-gate";
import { QuoteForm } from "@/components/quote-form";
import { ResultsPanel } from "@/components/results-panel";
import { SiteHeader, type ChatMode } from "@/components/site-header";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { track } from "@/lib/analytics";
import { useLead } from "@/lib/lead-context";
import { monthlyEquivalent } from "@/lib/types";
import { useBrokerChat } from "@/lib/use-broker-chat";
import { useQuoteRequest } from "@/lib/use-quote-request";
import { cn } from "@/lib/utils";

type MobileTab = "chat" | "matches";

export function AppShell() {
  const { leadId, isUnlocked, clearLead } = useLead();
  const [mode, setMode] = useState<ChatMode>("chat");
  const [tab, setTab] = useState<MobileTab>("chat");

  // The form is the only source of quotes; the chat only talks about them.
  const request = useQuoteRequest({ leadId, onSessionExpired: clearLead });
  const { messages, send, retry, isBusy, error } = useBrokerChat({
    leadId,
    onSessionExpired: clearLead,
  });

  const { quotes } = request;

  // On mobile the results panel is behind a tab — surface it when quotes land.
  const announced = useRef(0);
  useEffect(() => {
    if (quotes.length > 0 && quotes.length !== announced.current) {
      announced.current = quotes.length;
      track({
        name: "quotes_shown",
        count: quotes.length,
        cheapest: Math.min(...quotes.map(monthlyEquivalent)),
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
          Quote &amp; chat
        </TabButton>
        <TabButton active={tab === "matches"} onClick={() => setTab("matches")}>
          Matches{quotes.length > 0 ? ` · ${quotes.length}` : ""}
        </TabButton>
      </div>

      <main className="flex min-h-0 flex-1 lg:divide-x lg:divide-white/5">
        {/* Left column: the quote form on top, the support chat beneath it. */}
        <div
          className={cn(
            "min-h-0 flex-1 flex-col lg:w-[30%] lg:max-w-[560px] lg:min-w-[360px] lg:flex-none lg:flex",
            tab === "chat" ? "flex" : "hidden",
          )}
        >
          {/* Scrolls on its own while expanded, capped so the chat input stays
              reachable; collapses to a summary once COMPARE has run. */}
          <section
            aria-label="Quote form"
            className="no-scrollbar max-h-[62dvh] shrink-0 overflow-y-auto border-b border-white/5 px-4 py-4 sm:px-6"
          >
            <QuoteForm
              key={leadId ?? "locked"}
              leadId={leadId}
              submitted={request.submitted}
              loading={request.loading}
              error={request.error}
              serverErrors={request.fieldErrors}
              onSubmit={request.submit}
            />
          </section>

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
            quotes={quotes}
            notices={request.notices}
            loading={request.loading}
            error={request.error}
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
