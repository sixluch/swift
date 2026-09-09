"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { CoverageChips } from "@/components/coverage-chips";
import { QuoteCard } from "@/components/quote-card";
import { config } from "@/lib/config";
import type { CoverageType } from "@/lib/coverage";
import type { Quote } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "price-asc" | "price-desc" | "coverage-desc";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "price-asc", label: "Cheapest" },
  { id: "price-desc", label: "Priciest" },
  { id: "coverage-desc", label: "Most cover" },
];

interface ResultsPanelProps {
  selected: CoverageType[];
  onToggle: (id: CoverageType) => void;
  quotes: Quote[];
  loading: boolean;
  /** Set when the chip-driven fetch failed. */
  error?: string | null;
  /** True while prices assume an age, because the chat hasn't produced one yet. */
  indicative?: boolean;
}

export function ResultsPanel({
  selected,
  onToggle,
  quotes,
  loading,
  error = null,
  indicative = false,
}: ResultsPanelProps) {
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [insurer, setInsurer] = useState<string>("all");

  const insurers = useMemo(
    () => Array.from(new Set(quotes.map((q) => q.insurer))).sort(),
    [quotes],
  );

  const visible = useMemo(() => {
    const filtered =
      insurer === "all" ? quotes : quotes.filter((q) => q.insurer === insurer);

    return [...filtered].sort((a, b) => {
      if (sort === "price-desc") return b.monthlyPremium - a.monthlyPremium;
      if (sort === "coverage-desc") {
        return (
          b.coverageTypes.length - a.coverageTypes.length ||
          a.monthlyPremium - b.monthlyPremium
        );
      }
      return a.monthlyPremium - b.monthlyPremium;
    });
  }, [quotes, insurer, sort]);

  const cheapest = visible.length > 0 ? visible[0].monthlyPremium : null;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-navy-850 px-4 py-5 sm:px-6"
      aria-label="Coverage and results"
    >
      <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">COVERAGE</p>
      <div className="mt-3">
        <CoverageChips selected={selected} onToggle={onToggle} />
      </div>

      {quotes.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border border-white/10 bg-navy-900/60 p-0.5">
            {SORTS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={sort === option.id}
                onClick={() => setSort(option.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  sort === option.id
                    ? "bg-brand text-navy-950"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <select
            value={insurer}
            onChange={(e) => setInsurer(e.target.value)}
            aria-label="Filter by insurer"
            className="rounded-full border border-white/10 bg-navy-900/60 px-3 py-1 text-[11px] text-slate-300 outline-none"
          >
            <option value="all">All insurers</option>
            {insurers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <span className="text-[11px] text-slate-500">
            {visible.length} of {quotes.length}
          </span>
        </div>
      )}

      {quotes.length > 0 && indicative && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Indicative prices — tell {config.assistantName} your age and these firm up.
        </p>
      )}

      <div className="no-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto">
        {quotes.length === 0 ? (
          <EmptyState loading={loading} error={error} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((quote) => (
              <li key={quote.id}>
                <QuoteCard quote={quote} isCheapest={quote.monthlyPremium === cheapest} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptyState({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <TriangleAlert aria-hidden className="size-7 text-red-400" />
        <h2 className="mt-4 text-base font-semibold text-white">
          Couldn&apos;t load quotations
        </h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      {loading ? (
        <Loader2 aria-hidden className="size-7 animate-spin text-brand" />
      ) : (
        <Sparkles aria-hidden className="size-7 text-brand" />
      )}
      <h2 className="mt-4 text-base font-semibold text-white">
        {loading ? "Finding your matches…" : "Your matches will appear here"}
      </h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
        {loading
          ? "Checking the market against what you told Nomi."
          : `Start a quote with ${config.assistantName} and the whole market lands here — ranked, filterable, comparable.`}
      </p>
    </div>
  );
}
