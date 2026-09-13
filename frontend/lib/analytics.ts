"use client";

/**
 * Stub analytics sink. Swap the body of `track` for a real provider
 * (Vercel Analytics, PostHog, GA) — call sites stay unchanged.
 */
export type AnalyticsEvent =
  | { name: "lead_captured"; source: string }
  | { name: "coverage_selected"; coverageTypes: string[] }
  | { name: "quote_requested"; dependants: number }
  | { name: "message_sent"; inputMode: "typed" | "voice" }
  | { name: "quotes_shown"; count: number; cheapest: number }
  | { name: "quote_selected"; quoteId: string; insurer: string; premium: number }
  | { name: "quote_addon_toggled"; quoteId: string; addOn: string }
  | { name: "agent_requested"; quoteId: string }
  | { name: "quote_delivery"; channel: "email" | "whatsapp" }
  | { name: "voice_unsupported" };

export function track(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  const { name, ...payload } = event;
  console.info(`[analytics] ${name}`, payload);
}
