"use client";

import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { Quote } from "@/lib/types";

/** The summary is a "·"-separated line from the provider; each part is one bullet. */
function specs(summary: string): string[] {
  return summary
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function QuoteCard({ quote, isCheapest }: { quote: Quote; isCheapest: boolean }) {
  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl border bg-navy-800 p-4",
        isCheapest ? "border-brand/50" : "border-white/10",
      )}
    >
      <header>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm leading-snug font-semibold text-white">{quote.insurer}</h3>
          {isCheapest && (
            <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand">
              Best price
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-400">{quote.planName}</p>
      </header>

      <p className="mt-3 text-lg leading-none font-semibold text-brand">
        {quote.currency} {quote.monthlyPremium}
        <span className="ml-1 text-[11px] font-normal text-slate-400">per month</span>
      </p>

      <ul className="mt-3 space-y-1.5">
        {specs(quote.coverageSummary).map((spec) => (
          <li key={spec} className="flex gap-2 text-xs leading-relaxed text-slate-300">
            <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-brand" />
            <span>{spec}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex-1" />

      <button
        type="button"
        onClick={() =>
          track({
            name: "quote_selected",
            quoteId: quote.id,
            insurer: quote.insurer,
            premium: quote.monthlyPremium,
          })
        }
        className="w-full rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-navy-950 hover:bg-[#69b1ee]"
      >
        Select this plan
      </button>
      <button
        type="button"
        onClick={() => track({ name: "agent_requested", quoteId: quote.id })}
        className="mt-2 w-full text-center text-[11px] text-slate-400 hover:text-slate-200"
      >
        Talk to an agent
      </button>
    </article>
  );
}
