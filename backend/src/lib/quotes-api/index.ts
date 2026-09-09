import { getMockQuotes } from "./providers/mock-provider.js";
import type { QuoteProvider, QuoteRequest, QuoteResponse } from "./types.js";

export * from "./types.js";

/** Swap this for a real insurer adapter — nothing outside this folder should change. */
const provider: QuoteProvider = { getQuotes: getMockQuotes };

export async function getQuotes(request: QuoteRequest): Promise<QuoteResponse> {
  return provider.getQuotes(request);
}
