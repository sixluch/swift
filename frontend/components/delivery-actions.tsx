"use client";

import { useState } from "react";
import { MessageCircle, Mail } from "lucide-react";
import { track } from "@/lib/analytics";
import { api } from "@/lib/api-client";
import { config } from "@/lib/config";
import { useLead } from "@/lib/lead-context";
import type { DeliveryChannel } from "@/lib/profile";
import type { Quote } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Plain-text comparison, short enough to survive a WhatsApp deep link. */
function buildSummary(quotes: Quote[]): string {
  const lines = quotes
    .slice(0, 6)
    .map(
      (q, i) =>
        `${i + 1}. ${q.insurer} — ${q.planName}: ${q.currency} ${q.premium.toLocaleString()}${
          q.premiumBasis === "annual" ? "/yr" : "/mo"
        }`,
    );

  return [
    `My ${config.brandName} quote comparison:`,
    "",
    ...lines,
    "",
    `Prepared with ${config.assistantName}.`,
  ].join("\n");
}

interface DeliveryActionsProps {
  quotes: Quote[];
}

/**
 * Where to send the comparison, chosen under the results. WhatsApp opens a
 * wa.me deep link with the comparison pre-filled — sending programmatically
 * would need the WhatsApp Business API, which is a business-verification
 * process, not a code change. Email is recorded as a preference only: nothing
 * is sent from the app yet, so the copy promises a person, not an automated
 * mail. Either choice is stored on the conversation for the adviser.
 */
export function DeliveryActions({ quotes }: DeliveryActionsProps) {
  const { leadId, contact } = useLead();
  const [chosen, setChosen] = useState<DeliveryChannel | null>(null);

  if (quotes.length === 0) return null;

  function choose(channel: DeliveryChannel) {
    setChosen(channel);
    track({ name: "quote_delivery", channel });
    // Fire-and-forget: a failed preference write must not block the deep link.
    if (leadId) void api.chooseDelivery(leadId, channel).catch(() => undefined);
  }

  const digits = (contact?.phone ?? "").replace(/\D/g, "");
  const whatsappHref = `https://wa.me/${digits}?text=${encodeURIComponent(buildSummary(quotes))}`;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => choose("whatsapp")}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-whatsapp px-4 py-2 text-xs font-semibold text-[#0B141A] transition-opacity hover:opacity-90"
        >
          <MessageCircle aria-hidden className="size-4" />
          Send to WhatsApp
        </a>
        <button
          type="button"
          onClick={() => choose("email")}
          aria-pressed={chosen === "email"}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors",
            chosen === "email"
              ? "border-brand/60 bg-brand/15 text-white"
              : "border-white/10 bg-navy-900/60 text-slate-200 hover:bg-navy-800",
          )}
        >
          <Mail aria-hidden className="size-4" />
          Email me the comparison
        </button>
      </div>

      {chosen === "email" && (
        <p className="rounded-xl border border-white/10 bg-navy-900/60 px-4 py-2.5 text-xs leading-relaxed text-slate-300">
          Noted — an adviser will email this comparison to{" "}
          <span className="font-medium text-white">{contact?.email ?? "your address"}</span>.
        </p>
      )}
    </div>
  );
}
