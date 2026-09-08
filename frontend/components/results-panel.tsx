"use client";

import { Sparkles } from "lucide-react";
import { CoverageChips } from "@/components/coverage-chips";
import type { CoverageType } from "@/lib/coverage";
import type { Quote } from "@/lib/types";
import { config } from "@/lib/config";

interface ResultsPanelProps {
  selected: CoverageType[];
  onToggle: (id: CoverageType) => void;
  quotes: Quote[];
}

export function ResultsPanel({ selected, onToggle, quotes }: ResultsPanelProps) {
  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-navy-850 px-4 py-5 sm:px-6"
      aria-label="Coverage and results"
    >
      <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">COVERAGE</p>
      <div className="mt-3">
        <CoverageChips selected={selected} onToggle={onToggle} />
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
        {quotes.length === 0 ? <EmptyState /> : <QuoteList quotes={quotes} />}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Sparkles aria-hidden className="size-7 text-brand" />
      <h2 className="mt-4 text-base font-semibold text-white">Your matches will appear here</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
        Start a quote with {config.assistantName} and the whole market lands here — ranked,
        filterable, comparable.
      </p>
    </div>
  );
}

/* Sort/filter controls arrive in Phase 5 alongside real quote data. */
function QuoteList({ quotes }: { quotes: Quote[] }) {
  return (
    <ul className="space-y-3">
      {quotes.map((quote) => (
        <li
          key={quote.id}
          className="rounded-xl border border-white/10 bg-navy-800 p-4 text-sm text-slate-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{quote.planName}</p>
              <p className="truncate text-xs text-slate-400">{quote.insurer}</p>
            </div>
            <p className="shrink-0 font-semibold text-brand">
              {quote.currency} {quote.monthlyPremium}
              <span className="text-xs font-normal text-slate-400">/mo</span>
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{quote.coverageSummary}</p>
        </li>
      ))}
    </ul>
  );
}
