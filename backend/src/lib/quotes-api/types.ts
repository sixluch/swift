export type CoverageType = "inpatient" | "outpatient" | "dental" | "maternity";

export const COVERAGE_TYPES: CoverageType[] = [
  "inpatient",
  "outpatient",
  "dental",
  "maternity",
];

export interface QuoteRequest {
  name: string;
  age: number;
  coverageTypes: CoverageType[];
  /** ISO 3166-1 alpha-2 country of residence — drives the regional price band. */
  country?: string;
  /** Ages of any family members on the same policy; each is priced and added. */
  additionalAges?: number[];
}

/**
 * How to read `Quote.premium`. Real rate cards are printed annually and the
 * client's locked decision is to show them as printed, so a quote carries its
 * own basis rather than every surface assuming one.
 */
export type PremiumBasis = "monthly" | "annual";

/**
 * An extra the visitor can switch on, priced on top of the plan. `currency` is
 * a flat amount in the quote's currency; `percent` is a share of the base
 * premium (VUMI's outpatient add-on is +65%, not a fixed sum).
 */
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
  /** As the insurer prints it — always read alongside `premiumBasis`. */
  premium: number;
  premiumBasis: PremiumBasis;
  currency: string;
  coverageSummary: string;
  coverageTypes: CoverageType[];
  /** Optional benefits the admin has marked available for this plan. */
  addOns?: QuoteAddOn[];
  /** Caveats shown on the card, e.g. a requested cover the plan doesn't include. */
  notes?: string[];
}

export interface QuoteResponse {
  quotes: Quote[]; // always at least 3, cheapest first
  /** Insurer-level messages, e.g. a real card that doesn't cover this country. */
  notices?: string[];
}

/**
 * Quotes arrive on different bases — the mock prices monthly, a rate card
 * annually — so anything that sorts or compares them must normalise first.
 * Display still uses the native basis.
 */
export function monthlyEquivalent(quote: Quote): number {
  return quote.premiumBasis === "annual" ? quote.premium / 12 : quote.premium;
}

/** The contract a real insurer integration must satisfy to replace the mock. */
export interface QuoteProvider {
  getQuotes(request: QuoteRequest): Promise<QuoteResponse>;
}
