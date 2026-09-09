import { cn } from "@/lib/utils";

/** No per-message avatar — the assistant is anchored by the badge in the input bar. */
export function ChatBubble({ role, text }: { role: string; text: string }) {
  const isAssistant = role !== "user";

  return (
    <div className={cn("flex w-full", isAssistant ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap sm:max-w-[75%]",
          isAssistant
            ? "rounded-bl-sm bg-navy-800 text-slate-100"
            : "rounded-br-sm bg-brand text-navy-950",
        )}
      >
        {text}
      </div>
    </div>
  );
}
