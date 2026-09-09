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
