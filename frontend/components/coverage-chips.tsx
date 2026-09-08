"use client";

import { COVERAGE_OPTIONS, type CoverageType } from "@/lib/coverage";
import { cn } from "@/lib/utils";

interface CoverageChipsProps {
  selected: CoverageType[];
  onToggle: (id: CoverageType) => void;
}

export function CoverageChips({ selected, onToggle }: CoverageChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {COVERAGE_OPTIONS.map((option) => {
        const active = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(option.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-brand/60 bg-brand/15 text-white"
                : "border-white/10 bg-navy-800/60 text-slate-300 hover:bg-navy-800",
            )}
          >
            <span aria-hidden>{option.emoji}</span>
            <span>
              {!active && <span aria-hidden className="mr-0.5 text-slate-500">+</span>}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
