import { and, asc, eq, inArray, lte, gte } from "drizzle-orm";
import { db, schema } from "../../../db/client.js";
import { countryNameFor } from "../../countries.js";
import { priceQuote } from "../pricing.js";
import type { CoverageType, Quote, QuoteAddOn, QuoteRequest, QuoteResponse } from "../types.js";

/**
 * Quotes drawn from rate cards an admin has uploaded and parsed.
 *
 * Named for the data, not the insurer: the lookup is
 * country -> area -> age band -> plan rows, which is the shape of every card in
 * `rate_cards`. VUMI is simply the only one loaded today, and its specifics live
 * in the parser (`lib/rate-cards/vumi-parser.ts`), not here.
 *
 * Nothing is inferred. A country outside every area, or an age past the last
 * printed band, produces no quote and an explicit notice — a wrong premium is
 * worse than no premium.
 */

/**
 * Which coverage a plan includes natively.
 *
 * Derived from the card itself rather than assumed: "Outpatient Treatment -
 * $5,000" is an optional benefit carrying `only_plans = {BASIC}`, which is only
 * coherent if BASIC is the one plan without outpatient built in. Dental and
 * maternity appear nowhere on the card, so no plan claims them.
 */
const INPATIENT_ONLY_PLANS = new Set(["BASIC"]);

const NATIVE_COVER: CoverageType[] = ["inpatient", "outpatient"];

/** Cover the visitor can ask for that no loaded card prices at all. */
const UNPRICED_COVER: CoverageType[] = ["dental", "maternity"];

function coverFor(planCode: string): CoverageType[] {
  return INPATIENT_ONLY_PLANS.has(planCode) ? ["inpatient"] : NATIVE_COVER;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface CardContext {
  rateCardId: string;
  rateAreaId: string;
  areaCode: string;
  insurerName: string;
  productName: string;
  currency: string;
  premiumBasis: "annual" | "monthly";
}

/** Every area that covers this country, across all parsed cards. */
async function areasForCountry(iso: string): Promise<CardContext[]> {
  const rows = await db
    .select({
      rateCardId: schema.rateCards.id,
      rateAreaId: schema.rateAreas.id,
      areaCode: schema.rateAreas.areaCode,
      insurerName: schema.insurers.name,
      productName: schema.products.name,
      currency: schema.rateCards.currency,
      premiumBasis: schema.rateCards.premiumBasis,
    })
    .from(schema.rateAreaCountries)
    .innerJoin(schema.rateAreas, eq(schema.rateAreas.id, schema.rateAreaCountries.rateAreaId))
    .innerJoin(schema.rateCards, eq(schema.rateCards.id, schema.rateAreas.rateCardId))
    .innerJoin(schema.products, eq(schema.products.id, schema.rateCards.productId))
    .innerJoin(schema.insurers, eq(schema.insurers.id, schema.products.insurerId))
    .where(eq(schema.rateAreaCountries.countryIso, iso))
    .orderBy(asc(schema.insurers.name));

  return rows.map((row) => ({
    ...row,
    premiumBasis: row.premiumBasis === "monthly" ? "monthly" : "annual",
  }));
}

/** Insurers holding a parsed card, so one that skips this country can say so. */
async function insurersWithCards(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: schema.insurers.name })
    .from(schema.rateCards)
    .innerJoin(schema.products, eq(schema.products.id, schema.rateCards.productId))
    .innerJoin(schema.insurers, eq(schema.insurers.id, schema.products.insurerId));

  return rows.map((r) => r.name);
}

export async function getRateCardQuotes(request: QuoteRequest): Promise<QuoteResponse> {
  const iso = request.country?.toUpperCase();

  // Without a country there is no area, and without an area there is no price.
  // Silent rather than a notice: the visitor hasn't been asked yet.
  if (!iso) return { quotes: [] };

  const contexts = await areasForCountry(iso);
  const countryName = countryNameFor(iso) ?? iso;

  if (contexts.length === 0) {
    const insurers = await insurersWithCards();
    return {
      quotes: [],
      notices: insurers.map(
        (name) => `${name} is not available in your country (${countryName}).`,
      ),
    };
  }

  const quotes: Quote[] = [];
  const notices: string[] = [];

  for (const context of contexts) {
    const built = await quotesForCard(context, request, countryName);
    quotes.push(...built.quotes);
    notices.push(...built.notices);
  }

  return { quotes, notices };
}

async function quotesForCard(
  context: CardContext,
  request: QuoteRequest,
  countryName: string,
): Promise<{ quotes: Quote[]; notices: string[] }> {
  const ages = [request.age, ...(request.additionalAges ?? [])];

  const [plans, benefits] = await Promise.all([
    db
      .select()
      .from(schema.ratePlans)
      .where(eq(schema.ratePlans.rateCardId, context.rateCardId))
      .orderBy(asc(schema.ratePlans.sortOrder)),
    db
      .select()
      .from(schema.rateBenefits)
      .where(
        and(
          eq(schema.rateBenefits.rateCardId, context.rateCardId),
          // The admin's toggle is the gate: an unticked benefit is not offered.
          eq(schema.rateBenefits.available, true),
        ),
      )
      .orderBy(asc(schema.rateBenefits.sortOrder)),
  ]);

  if (plans.length === 0) return { quotes: [], notices: [] };

  // One query for every person's band rather than one per person.
  const premiumRows = await db
    .select({
      ratePlanId: schema.ratePremiums.ratePlanId,
      ageMin: schema.ratePremiums.ageMin,
      ageMax: schema.ratePremiums.ageMax,
      premium: schema.ratePremiums.premium,
    })
    .from(schema.ratePremiums)
    .where(
      and(
        eq(schema.ratePremiums.rateAreaId, context.rateAreaId),
        inArray(
          schema.ratePremiums.ratePlanId,
          plans.map((p) => p.id),
        ),
      ),
    );

  /** planId -> the premium for each person, or null if an age has no band. */
  function bandedTotal(planId: string): number | null {
    let total = 0;
    for (const age of ages) {
      const row = premiumRows.find(
        (r) => r.ratePlanId === planId && r.ageMin <= age && r.ageMax >= age,
      );
      if (!row) return null;
      // Each person is priced at their own band and added, which is how a
      // family premium is actually built.
      total += row.premium;
    }
    return total;
  }

  const requested = request.coverageTypes;
  const unpriced = UNPRICED_COVER.filter((type) => requested.includes(type));
  const quotes: Quote[] = [];
  const notices: string[] = [];

  const oldest = Math.max(...ages);
  let ageGap = false;

  for (const plan of plans) {
    const base = bandedTotal(plan.id);
    if (base === null) {
      ageGap = true;
      continue;
    }

    const cover = coverFor(plan.code);
    const addOns = addOnsFor(benefits, plan.code);
    const notes: string[] = [];

    // Locked decision: still show the plan, flagged, rather than hiding it.
    for (const type of unpriced) {
      notes.push(`${titleCase(type)} not covered by this plan.`);
    }

    // Outpatient on BASIC is purchasable, so the plan is offered with the
    // add-on surfaced rather than filtered out for lacking it.
    const missingNative = requested.filter(
      (type) => !UNPRICED_COVER.includes(type) && !cover.includes(type),
    );
    for (const type of missingNative) {
      const addOn = addOns.find((a) => a.label.toLowerCase().includes(type));
      notes.push(
        addOn
          ? `${titleCase(type)} available as an add-on (+${addOn.amount}%).`
          : `${titleCase(type)} not covered by this plan.`,
      );
    }

    quotes.push({
      id: `${context.rateCardId}:${plan.id}`,
      insurer: context.insurerName,
      planName: `${context.productName} — ${plan.label}`,
      premium: priceQuote({ base }),
      premiumBasis: context.premiumBasis,
      currency: context.currency,
      coverageSummary: summarize(context, cover, ages),
      coverageTypes: cover,
      addOns: addOns.length > 0 ? addOns : undefined,
      notes: notes.length > 0 ? notes : undefined,
    });
  }

  if (ageGap) {
    notices.push(
      `${context.insurerName} does not publish a rate for age ${oldest} in ${countryName}.`,
    );
  }

  return { quotes, notices };
}

/** The admin-ticked benefits this plan is eligible for. */
function addOnsFor(
  benefits: (typeof schema.rateBenefits.$inferSelect)[],
  planCode: string,
): QuoteAddOn[] {
  return benefits
    .filter((benefit) => {
      if (benefit.onlyPlans.length > 0 && !benefit.onlyPlans.includes(planCode)) return false;
      if (benefit.excludedPlans.includes(planCode)) return false;
      return true;
    })
    .map((benefit) => ({
      id: benefit.id,
      label: benefit.label,
      unit: benefit.unit === "percent" ? ("percent" as const) : ("currency" as const),
      amount: Number(benefit.amount),
    }));
}

function summarize(context: CardContext, cover: CoverageType[], ages: number[]): string {
  const who = ages.length > 1 ? `Family of ${ages.length}` : "Individual";
  const covered = cover.map(titleCase).join(", ");
  return `${who} · ${covered} · Area ${context.areaCode} · ${context.premiumBasis === "annual" ? "Annual premium" : "Monthly premium"}`;
}
