"use client";

import { Mic, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceBarProps {
  listening: boolean;
  pendingSend: boolean;
  liveText: string;
  onToggle: () => void;
  onCancel: () => void;
  disabled: boolean;
}

/** Mic control plus the live transcript, shown in place of the text input in Speak mode. */
export function VoiceBar({
  listening,
  pendingSend,
  liveText,
  onToggle,
  onCancel,
  disabled,
}: VoiceBarProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Start speaking"}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
          listening ? "bg-red-500 text-white" : "bg-brand text-navy-950",
        )}
      >
        {listening ? <Square className="size-3.5" /> : <Mic className="size-4" />}
      </button>

      <div className="min-w-0 flex-1 py-1.5 text-sm">
        {liveText ? (
          <p className="truncate text-white">{liveText}</p>
        ) : (
          <p className="truncate text-slate-500">
            {listening ? "Listening…" : "Tap the mic and start talking"}
          </p>
        )}
      </div>

      {listening && (
        <span aria-hidden className="flex shrink-0 items-end gap-0.5">
          {[0, 120, 240].map((delay) => (
            <span
              key={delay}
              style={{ animationDelay: `${delay}ms` }}
              className="h-3 w-0.5 animate-pulse rounded-full bg-brand"
            />
          ))}
        </span>
      )}

      {pendingSend && (
        <button
          type="button"
          onClick={onCancel}
          className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/15"
        >
          <X className="size-3" />
          Cancel send
        </button>
      )}
    </div>
  );
}
