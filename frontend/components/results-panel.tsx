"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { QuoteCard } from "@/components/quote-card";
import { monthlyEquivalent, type Quote } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DeliveryActions } from "@/components/delivery-actions";

type SortKey = "price-asc" | "price-desc" | "coverage-desc";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "price-asc", label: "Cheapest" },
  { id: "price-desc", label: "Priciest" },
  { id: "coverage-desc", label: "Most cover" },
];

interface ResultsPanelProps {
  quotes: Quote[];
  /** Insurer-level messages, e.g. a real card that does not cover this country. */
  notices?: string[];
  loading: boolean;
  error?: string | null;
}

export function ResultsPanel({ quotes, notices = [], loading, error = null }: ResultsPanelProps) {
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [insurer, setInsurer] = useState<string>("all");

  const insurers = useMemo(
    () => Array.from(new Set(quotes.map((q) => q.insurer))).sort(),
    [quotes],
  );

  const visible = useMemo(() => {
    const filtered =
      insurer === "all" ? quotes : quotes.filter((q) => q.insurer === insurer);

    // Monthly-equivalent throughout: an annual rate-card premium and a monthly
    // mock one are not comparable as raw numbers.
    return [...filtered].sort((a, b) => {
      if (sort === "price-desc") return monthlyEquivalent(b) - monthlyEquivalent(a);
      if (sort === "coverage-desc") {
        return (
          b.coverageTypes.length - a.coverageTypes.length ||
          monthlyEquivalent(a) - monthlyEquivalent(b)
        );
      }
      return monthlyEquivalent(a) - monthlyEquivalent(b);
    });
  }, [quotes, insurer, sort]);

  const cheapest = visible.length > 0 ? monthlyEquivalent(visible[0]) : null;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-navy-850 px-4 py-5 sm:px-6"
      aria-label="Results"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">YOUR MATCHES</p>
        {quotes.length > 0 && (
          <span className="text-[11px] text-slate-500">
            {visible.length} of {quotes.length}
          </span>
        )}
      </div>

      {quotes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
        </div>
      )}

      {/* An insurer that can't cover this visitor is a result, not an absence —
          without this the panel just silently omits them. */}
      {notices.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {notices.map((notice) => (
            <li
              key={notice}
              className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200/90"
            >
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>{notice}</span>
            </li>
          ))}
        </ul>
      )}

      {quotes.length > 0 && <DeliveryActions quotes={visible} />}

      <div className="no-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto">
        {quotes.length === 0 ? (
          <EmptyState loading={loading} error={error} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((quote) => (
              <li key={quote.id}>
                <QuoteCard quote={quote} isCheapest={monthlyEquivalent(quote) === cheapest} />
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
          ? "Checking the market against your form."
          : "Fill in the quote form and press Compare — the whole market lands here, ranked, filterable, comparable."}
      </p>
    </div>
  );
}
