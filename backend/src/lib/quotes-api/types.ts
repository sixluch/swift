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

export interface Quote {
  id: string;
  insurer: string;
  planName: string;
  monthlyPremium: number;
  currency: string;
  coverageSummary: string;
  coverageTypes: CoverageType[];
}

export interface QuoteResponse {
  quotes: Quote[]; // always at least 3, cheapest first
}

/** The contract a real insurer integration must satisfy to replace the mock. */
export interface QuoteProvider {
  getQuotes(request: QuoteRequest): Promise<QuoteResponse>;
}
