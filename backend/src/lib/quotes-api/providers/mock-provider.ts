import { env } from "../../../env.js";
import type { CoverageType, QuoteRequest, QuoteResponse, Quote } from "../types.js";

/** Fictional insurers — placeholders until a real integration replaces this provider. */
const INSURERS = [
  { name: "Cedar Assurance", slug: "cedar", priceFactor: 0.92 },
  { name: "Phoenicia Health", slug: "phoenicia", priceFactor: 1.0 },
  { name: "Levant Mutual", slug: "levant", priceFactor: 1.07 },
  { name: "Byblos Care", slug: "byblos", priceFactor: 0.97 },
  { name: "Mediterra Assurance", slug: "mediterra", priceFactor: 1.14 },
];

interface Tier {
  id: string;
  label: string;
  basePremium: number;
  covers: CoverageType[];
  annualLimit: number;
  copay: number;
  room: string;
}

/** Tiers are cumulative: a higher tier covers everything the one below it does. */
const TIERS: Tier[] = [
  {
    id: "essential",
    label: "Essential",
    basePremium: 45,
    covers: ["inpatient"],
    annualLimit: 25_000,
    copay: 20,
    room: "Shared room",
  },
  {
    id: "plus",
    label: "Plus",
    basePremium: 78,
    covers: ["inpatient", "outpatient", "dental"],
    annualLimit: 60_000,
    copay: 10,
    room: "Private room",
  },
  {
    id: "premium",
    label: "Premium",
    basePremium: 120,
    covers: ["inpatient", "outpatient", "dental", "maternity"],
    annualLimit: 150_000,
    copay: 0,
    room: "Private room, worldwide network",
  },
];

/** Age bands drive most of the spread between quotes. */
function ageFactor(age: number): number {
  if (age < 18) return 0.85;
  if (age < 30) return 1;
  if (age < 40) return 1.15;
  if (age < 50) return 1.4;
  if (age < 60) return 1.8;
  if (age < 70) return 2.3;
  return 2.9;
}

function premiumFor(tier: Tier, insurerFactor: number, request: QuoteRequest): number {
  const requested = request.coverageTypes.length;
  const breadthLoading = 1 + 0.05 * Math.max(0, requested - 1);
  const maternityLoading = request.coverageTypes.includes("maternity") ? 1.15 : 1;

  const premium =
    tier.basePremium *
    insurerFactor *
    ageFactor(request.age) *
    breadthLoading *
    maternityLoading;

  return Math.round(premium);
}

function summarize(tier: Tier): string {
  const covered = tier.covers.map((c) => c[0].toUpperCase() + c.slice(1)).join(", ");
  const copay = tier.copay === 0 ? "no co-pay" : `${tier.copay}% co-pay`;
  return `${covered} · ${env.QUOTE_CURRENCY} ${tier.annualLimit.toLocaleString("en-US")} annual limit · ${copay} · ${tier.room}`;
}

function buildQuote(
  insurer: (typeof INSURERS)[number],
  tier: Tier,
  request: QuoteRequest,
): Quote {
  return {
    id: `${insurer.slug}-${tier.id}`,
    insurer: insurer.name,
    planName: `${insurer.name.split(" ")[0]} ${tier.label}`,
    monthlyPremium: premiumFor(tier, insurer.priceFactor, request),
    currency: env.QUOTE_CURRENCY,
    coverageSummary: summarize(tier),
    coverageTypes: tier.covers,
  };
}

const MAX_QUOTES = 6;
const MIN_QUOTES = 3;

export async function getMockQuotes(request: QuoteRequest): Promise<QuoteResponse> {
  const all = INSURERS.flatMap((insurer) =>
    TIERS.map((tier) => ({ tier, quote: buildQuote(insurer, tier, request) })),
  );

  // A plan qualifies only if it covers everything the user asked for.
  const matching = all.filter(({ tier }) =>
    request.coverageTypes.every((type) => tier.covers.includes(type)),
  );

  const pool = matching.length >= MIN_QUOTES ? matching : all;
  const quotes = pool
    .map(({ quote }) => quote)
    .sort((a, b) => a.monthlyPremium - b.monthlyPremium || a.id.localeCompare(b.id))
    .slice(0, MAX_QUOTES);

  return { quotes };
}
