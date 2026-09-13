import { getMockQuotes } from "./providers/mock-provider.js";
import { getRateCardQuotes } from "./providers/rate-card-provider.js";
import { monthlyEquivalent, type QuoteRequest, type QuoteResponse } from "./types.js";

export * from "./types.js";

/**
 * Real rate-card quotes merged with the mock's.
 *
 * The merge is deliberately asymmetric. Rate-card quotes come from a document an
 * admin uploaded, so **every one of them is kept**; the mock only fills the
 * remaining slots. Ranking the two pools together and truncating would drop the
 * real quotes every time — VUMI's cheapest Area 1 plan is USD 320/month against
 * the mock's USD 110, so a cheapest-first cut of six is six fictional insurers
 * and no VUMI at all. That is the whole point of loading the card.
 *
 * Sorting normalises to a monthly equivalent first: the mock prices monthly and
 * a rate card annually, so comparing the raw numbers would rank a USD 3,843
 * annual premium as dearer than a USD 190 monthly one.
 */
const MOCK_SLOTS = 6;

export async function getQuotes(request: QuoteRequest): Promise<QuoteResponse> {
  // Independent sources: one is a pure function, the other a few indexed reads.
  const [rateCards, mock] = await Promise.all([
    getRateCardQuotes(request).catch((err) => {
      // A rate-card failure must not take the whole panel down with it.
      console.error("[getQuotes] rate-card provider failed:", err);
      return { quotes: [], notices: [] } satisfies QuoteResponse;
    }),
    getMockQuotes(request),
  ]);

  const quotes = [...rateCards.quotes, ...mock.quotes.slice(0, MOCK_SLOTS)].sort(
    (a, b) => monthlyEquivalent(a) - monthlyEquivalent(b) || a.id.localeCompare(b.id),
  );

  const notices = rateCards.notices ?? [];

  return notices.length > 0 ? { quotes, notices } : { quotes };
}
