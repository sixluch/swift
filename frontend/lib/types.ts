export type ChatRole = "user" | "assistant";
export type InputMode = "typed" | "voice";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  inputMode?: InputMode;
}

/**
 * How to read `Quote.premium`. The mock prices monthly; a real rate card is
 * printed annually and is shown as printed, so the basis travels with the quote
 * instead of every surface assuming one.
 */
export type PremiumBasis = "monthly" | "annual";

/** An extra the visitor can switch on, priced on top of the plan. */
export interface QuoteAddOn {
  id: string;
  label: string;
  unit: "currency" | "percent";
  amount: number;
}

export interface Quote {
  id: string;
  insurer: string;
  planName: string;
  premium: number;
  premiumBasis: PremiumBasis;
  currency: string;
  coverageSummary: string;
  coverageTypes: string[];
  addOns?: QuoteAddOn[];
  /** Caveats shown on the card, e.g. a requested cover the plan doesn't include. */
  notes?: string[];
}

/**
 * Quotes arrive on different bases, so anything that sorts or compares them has
 * to normalise first — a USD 3,843 annual premium is cheaper than USD 400 a
 * month, not thirty times dearer. Display still uses the native basis.
 */
export function monthlyEquivalent(quote: Quote): number {
  return quote.premiumBasis === "annual" ? quote.premium / 12 : quote.premium;
}
