"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { Quote, QuoteAddOn } from "@/lib/types";

/** The summary is a "·"-separated line from the provider; each part is one bullet. */
function specs(summary: string): string[] {
  return summary
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Mirrors `backend/src/lib/quotes-api/pricing.ts`: percentage add-ons scale the
 * base premium, flat ones are added at face value afterwards. Kept in step with
 * that file — the card must never show a total the backend wouldn't compute.
 */
function totalWith(base: number, addOns: QuoteAddOn[]): number {
  const percent = addOns
    .filter((a) => a.unit === "percent")
    .reduce((sum, a) => sum + a.amount, 0);
  const flat = addOns
    .filter((a) => a.unit === "currency")
    .reduce((sum, a) => sum + a.amount, 0);

  return Math.round(base * (1 + percent / 100) + flat);
}

function addOnPrice(addOn: QuoteAddOn, currency: string): string {
  return addOn.unit === "percent" ? `+${addOn.amount}%` : `+${currency} ${addOn.amount}`;
}

export function QuoteCard({ quote, isCheapest }: { quote: Quote; isCheapest: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);

  const addOns = quote.addOns ?? [];

  const total = useMemo(
    () => totalWith(quote.premium, addOns.filter((a) => selected.includes(a.id))),
    [quote.premium, addOns, selected],
  );

  const per = quote.premiumBasis === "annual" ? "per year" : "per month";

  function toggle(addOn: QuoteAddOn) {
    setSelected((current) => {
      const next = current.includes(addOn.id)
        ? current.filter((id) => id !== addOn.id)
        : [...current, addOn.id];
      track({ name: "quote_addon_toggled", quoteId: quote.id, addOn: addOn.label });
      return next;
    });
  }

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
        {quote.currency} {total.toLocaleString()}
        <span className="ml-1 text-[11px] font-normal text-slate-400">{per}</span>
      </p>
      {selected.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          {quote.currency} {quote.premium.toLocaleString()} + {selected.length} extra
          {selected.length === 1 ? "" : "s"}
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {specs(quote.coverageSummary).map((spec) => (
          <li key={spec} className="flex gap-2 text-xs leading-relaxed text-slate-300">
            <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-brand" />
            <span>{spec}</span>
          </li>
        ))}
      </ul>

      {quote.notes && quote.notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {quote.notes.map((note) => (
            <li
              key={note}
              className="flex gap-1.5 text-[11px] leading-relaxed text-amber-200/90"
            >
              <Info aria-hidden className="mt-px size-3 shrink-0" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}

      {addOns.length > 0 && (
        <fieldset className="mt-3 border-t border-white/10 pt-3">
          <legend className="sr-only">Optional extras for {quote.planName}</legend>
          <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-500">
            OPTIONAL EXTRAS
          </p>
          <ul className="mt-2 space-y-1.5">
            {addOns.map((addOn) => (
              <li key={addOn.id}>
                <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-slate-300">
                  <input
                    type="checkbox"
                    checked={selected.includes(addOn.id)}
                    onChange={() => toggle(addOn)}
                    className="mt-0.5 size-3 shrink-0 accent-[#4A9FE8]"
                  />
                  <span className="min-w-0 flex-1">{addOn.label}</span>
                  <span className="shrink-0 text-slate-400">
                    {addOnPrice(addOn, quote.currency)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <div className="mt-4 flex-1" />

      <button
        type="button"
        onClick={() =>
          track({
            name: "quote_selected",
            quoteId: quote.id,
            insurer: quote.insurer,
            premium: total,
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
