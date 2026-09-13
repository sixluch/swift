"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { KNOWLEDGE_BASE_MAX_CHARS } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

interface KnowledgeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  rows?: number;
}

/**
 * The knowledge-base editor used for both the general text and each insurer's.
 * Plain textarea: the text goes into the assistant's prompt verbatim, so what
 * the admin sees is exactly what the model reads. The counter turns amber near
 * the cap and red over it — the backend refuses anything over, so the admin
 * finds out before pressing Save rather than after.
 */
export function KnowledgeTextarea({
  value,
  onChange,
  label = "Knowledge base",
  hint,
  placeholder,
  error,
  disabled,
  rows = 16,
}: KnowledgeTextareaProps) {
  const id = useId();
  const length = value.length;
  const over = length > KNOWLEDGE_BASE_MAX_CHARS;
  const near = !over && length > KNOWLEDGE_BASE_MAX_CHARS * 0.9;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span
          aria-live="polite"
          className={cn(
            "text-xs tabular-nums",
            over ? "text-red-400" : near ? "text-amber-300" : "text-slate-500",
          )}
        >
          {length.toLocaleString()} / {KNOWLEDGE_BASE_MAX_CHARS.toLocaleString()}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        spellCheck
        aria-invalid={over || Boolean(error)}
        className={cn(
          "w-full resize-y rounded-lg border border-white/10 bg-navy-850 px-3 py-2 font-mono text-[13px] leading-relaxed text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus-visible:border-brand/60 focus-visible:ring-3 focus-visible:ring-brand/20 disabled:opacity-50",
          (over || error) && "border-red-500/60",
        )}
      />
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
