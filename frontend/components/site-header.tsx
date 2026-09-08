"use client";

import { MessageSquare, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { config } from "@/lib/config";

export type ChatMode = "speak" | "chat";

interface SiteHeaderProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function SiteHeader({ mode, onModeChange }: SiteHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-base font-bold text-navy-950">
          {config.brandName.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight text-white">{config.brandName}</p>
          <p className="truncate text-xs text-slate-400">
            AI Insurance Assistant · {config.assistantName}
          </p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Input mode"
        className="flex shrink-0 items-center gap-1.5"
      >
        <ModePill
          active={mode === "speak"}
          onClick={() => onModeChange("speak")}
          icon={<Mic className="size-3.5" />}
          label="Speak"
        />
        <ModePill
          active={mode === "chat"}
          onClick={() => onModeChange("chat")}
          icon={<MessageSquare className="size-3.5" />}
          label="Chat"
        />
      </div>
    </header>
  );
}

function ModePill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-brand text-navy-950"
          : "border border-white/15 text-slate-300 hover:bg-white/5",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
