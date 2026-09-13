import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../../db/client.js";
import type { ParsedRateCard } from "./vumi-parser.js";

/** Persistence for a parsed rate card. */

export interface SaveSummary {
  rateCardId: string;
  productId: string;
  productName: string;
  areas: number;
  plans: number;
  premiums: number;
  countries: number;
  unmatchedCountries: string[];
  benefits: number;
  surcharges: number;
  deductibles: number;
  restrictions: number;
  warnings: string[];
  replacedPrevious: boolean;
}

/**
 * Writes a parsed card, replacing whatever the same document produced before —
 * re-parsing must be idempotent, or a corrected upload leaves two sets of
 * premiums behind and a quote could be drawn from either.
 *
 * One transaction: a rate card missing half its premiums is worse than no rate
 * card, because it would still be quoted from.
 */
export async function saveRateCard(params: {
  insurerId: string;
  documentId: string;
  sourceFilename: string;
  parsed: ParsedRateCard;
}): Promise<SaveSummary> {
  const { insurerId, documentId, sourceFilename, parsed } = params;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.rateCards.id, productId: schema.rateCards.productId })
      .from(schema.rateCards)
      .where(eq(schema.rateCards.documentId, documentId))
      .limit(1);

    if (existing) {
      // Cascades through areas, plans, premiums, countries and the three tables.
      await tx.delete(schema.rateCards).where(eq(schema.rateCards.id, existing.id));

      // A re-parse that resolves a different product name would otherwise leave
      // the old product behind with no rate cards under it.
      const remaining = await tx
        .select({ id: schema.rateCards.id })
        .from(schema.rateCards)
        .where(eq(schema.rateCards.productId, existing.productId))
        .limit(1);

      if (remaining.length === 0) {
        await tx.delete(schema.products).where(eq(schema.products.id, existing.productId));
      }
    }

    const [product] = await tx
      .insert(schema.products)
      .values({ insurerId, name: parsed.productName })
      .onConflictDoUpdate({
        target: [schema.products.insurerId, schema.products.name],
        set: { name: parsed.productName },
      })
      .returning();

    const [rateCard] = await tx
      .insert(schema.rateCards)
      .values({
        productId: product.id,
        documentId,
        currency: parsed.currency,
        premiumBasis: parsed.premiumBasis,
        sourceFilename,
        warnings: parsed.warnings,
        parsedAt: new Date(),
      })
      .returning();

    const planRows =
      parsed.plans.length > 0
        ? await tx
            .insert(schema.ratePlans)
            .values(
              parsed.plans.map((plan, i) => ({
                rateCardId: rateCard.id,
                code: plan.code,
                label: plan.label,
                sortOrder: i,
              })),
            )
            .returning({ id: schema.ratePlans.id, code: schema.ratePlans.code })
        : [];

    const planIdByCode = new Map(planRows.map((p) => [p.code, p.id]));

    const areaRows =
      parsed.areas.length > 0
        ? await tx
            .insert(schema.rateAreas)
            .values(
              parsed.areas.map((area, i) => ({
                rateCardId: rateCard.id,
                areaCode: area.areaCode,
                sortOrder: i,
              })),
            )
            .returning({ id: schema.rateAreas.id, areaCode: schema.rateAreas.areaCode })
        : [];

    const areaIdByCode = new Map(areaRows.map((a) => [a.areaCode, a.id]));

    const premiumValues = parsed.areas.flatMap((area) => {
      const rateAreaId = areaIdByCode.get(area.areaCode);
      if (!rateAreaId) return [];

      return area.premiums.flatMap((band) =>
        Object.entries(band.amounts).flatMap(([code, premium]) => {
          const ratePlanId = planIdByCode.get(code);
          if (!ratePlanId) return [];
          return [
            {
              rateCardId: rateCard.id,
              rateAreaId,
              ratePlanId,
              ageMin: band.ageMin,
              ageMax: band.ageMax,
              premium,
            },
          ];
        }),
      );
    });

    // 490 rows for VUMI — chunked so the driver isn't handed one huge statement.
    for (const chunk of chunks(premiumValues, 200)) {
      await tx.insert(schema.ratePremiums).values(chunk);
    }

    const restrictionValues = parsed.areas.flatMap((area) => {
      const rateAreaId = areaIdByCode.get(area.areaCode);
      if (!rateAreaId) return [];
      return area.restrictions.map((r) => ({
        rateAreaId,
        region: r.region,
        discountPercent: String(r.discountPercent),
      }));
    });
    if (restrictionValues.length > 0) {
      await tx.insert(schema.rateAreaRestrictions).values(restrictionValues);
    }

    const countryValues = parsed.countries.flatMap((country) => {
      const rateAreaId = areaIdByCode.get(country.areaCode);
      if (!rateAreaId) return [];
      return [{ rateAreaId, printedName: country.printedName, countryIso: country.iso }];
    });
    for (const chunk of chunks(countryValues, 200)) {
      await tx.insert(schema.rateAreaCountries).values(chunk);
    }

    if (parsed.benefits.length > 0) {
      await tx.insert(schema.rateBenefits).values(
        parsed.benefits.map((b, i) => ({
          rateCardId: rateCard.id,
          label: b.label,
          amount: String(b.amount),
          unit: b.unit,
          excludedPlans: b.excludedPlans,
          onlyPlans: b.onlyPlans,
          sortOrder: i,
        })),
      );
    }

    if (parsed.surcharges.length > 0) {
      await tx.insert(schema.rateSurcharges).values(
        parsed.surcharges.map((s, i) => ({
          rateCardId: rateCard.id,
          label: s.label,
          percent: String(s.percent),
          sortOrder: i,
        })),
      );
    }

    if (parsed.deductibles.length > 0) {
      await tx.insert(schema.rateDeductibles).values(
        parsed.deductibles.map((d, i) => ({
          rateCardId: rateCard.id,
          kind: d.kind,
          label: d.label,
          reductionPercent: String(d.reductionPercent),
          excludedPlans: d.excludedPlans,
          sortOrder: i,
        })),
      );
    }

    await tx
      .update(schema.insurerDocuments)
      .set({ parseStatus: parsed.warnings.length > 0 ? "parsed_with_warnings" : "parsed" })
      .where(eq(schema.insurerDocuments.id, documentId));

    return {
      rateCardId: rateCard.id,
      productId: product.id,
      productName: product.name,
      areas: areaRows.length,
      plans: planRows.length,
      premiums: premiumValues.length,
      countries: countryValues.length,
      unmatchedCountries: parsed.countries.filter((c) => !c.iso).map((c) => c.printedName),
      benefits: parsed.benefits.length,
      surcharges: parsed.surcharges.length,
      deductibles: parsed.deductibles.length,
      restrictions: restrictionValues.length,
      warnings: parsed.warnings,
      replacedPrevious: Boolean(existing),
    };
  });
}

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

/** Everything the admin console needs to show and edit one rate card. */
export async function getRateCard(rateCardId: string) {
  const [card] = await db
    .select({
      id: schema.rateCards.id,
      currency: schema.rateCards.currency,
      premiumBasis: schema.rateCards.premiumBasis,
      sourceFilename: schema.rateCards.sourceFilename,
      warnings: schema.rateCards.warnings,
      parsedAt: schema.rateCards.parsedAt,
      documentId: schema.rateCards.documentId,
      productId: schema.products.id,
      productName: schema.products.name,
      insurerId: schema.insurers.id,
      insurerName: schema.insurers.name,
    })
    .from(schema.rateCards)
    .innerJoin(schema.products, eq(schema.products.id, schema.rateCards.productId))
    .innerJoin(schema.insurers, eq(schema.insurers.id, schema.products.insurerId))
    .where(eq(schema.rateCards.id, rateCardId))
    .limit(1);

  if (!card) return null;

  const [plans, areas, benefits, surcharges, deductibles] = await Promise.all([
    db
      .select()
      .from(schema.ratePlans)
      .where(eq(schema.ratePlans.rateCardId, card.id))
      .orderBy(asc(schema.ratePlans.sortOrder)),
    db
      .select()
      .from(schema.rateAreas)
      .where(eq(schema.rateAreas.rateCardId, card.id))
      .orderBy(asc(schema.rateAreas.sortOrder)),
    db
      .select()
      .from(schema.rateBenefits)
      .where(eq(schema.rateBenefits.rateCardId, card.id))
      .orderBy(asc(schema.rateBenefits.sortOrder)),
    db
      .select()
      .from(schema.rateSurcharges)
      .where(eq(schema.rateSurcharges.rateCardId, card.id))
      .orderBy(asc(schema.rateSurcharges.sortOrder)),
    db
      .select()
      .from(schema.rateDeductibles)
      .where(eq(schema.rateDeductibles.rateCardId, card.id))
      .orderBy(asc(schema.rateDeductibles.sortOrder)),
  ]);

  const premiums = await db
    .select({
      rateAreaId: schema.ratePremiums.rateAreaId,
      ratePlanId: schema.ratePremiums.ratePlanId,
      ageMin: schema.ratePremiums.ageMin,
      ageMax: schema.ratePremiums.ageMax,
      premium: schema.ratePremiums.premium,
    })
    .from(schema.ratePremiums)
    .where(eq(schema.ratePremiums.rateCardId, card.id))
    .orderBy(asc(schema.ratePremiums.ageMin));

  const areaIds = areas.map((a) => a.id);

  const [countries, restrictions] = await Promise.all([
    areaIds.length > 0
      ? db
          .select()
          .from(schema.rateAreaCountries)
          .orderBy(asc(schema.rateAreaCountries.printedName))
      : Promise.resolve([]),
    areaIds.length > 0
      ? db.select().from(schema.rateAreaRestrictions)
      : Promise.resolve([]),
  ]);

  const areaIdSet = new Set(areaIds);

  return {
    card,
    plans,
    areas,
    premiums,
    // Filtered in memory: both tables are small and scoped by the area ids of
    // this card, and `inArray` with an empty list is a SQL error waiting.
    countries: countries.filter((c) => areaIdSet.has(c.rateAreaId)),
    restrictions: restrictions.filter((r) => areaIdSet.has(r.rateAreaId)),
    benefits,
    surcharges,
    deductibles,
  };
}

/** Rate cards belonging to one insurer, for its detail page. */
export async function listRateCardsForInsurer(insurerId: string) {
  return db
    .select({
      id: schema.rateCards.id,
      productName: schema.products.name,
      documentId: schema.rateCards.documentId,
      currency: schema.rateCards.currency,
      premiumBasis: schema.rateCards.premiumBasis,
      parsedAt: schema.rateCards.parsedAt,
      warnings: schema.rateCards.warnings,
    })
    .from(schema.rateCards)
    .innerJoin(schema.products, eq(schema.products.id, schema.rateCards.productId))
    .where(eq(schema.products.insurerId, insurerId))
    .orderBy(asc(schema.products.name));
}

export type SectionEdit =
  | { table: "benefit"; id: string; available?: boolean; amount?: number }
  | { table: "surcharge"; id: string; percent?: number }
  | { table: "deductible"; id: string; available?: boolean; reductionPercent?: number }
  | { table: "restriction"; id: string; available?: boolean; discountPercent?: number };

/** Applies the admin's manual edits to the three editable tables. */
export async function applySectionEdits(
  rateCardId: string,
  edits: SectionEdit[],
): Promise<number> {
  let applied = 0;

  await db.transaction(async (tx) => {
    for (const edit of edits) {
      if (edit.table === "benefit") {
        const set: Record<string, unknown> = {};
        if (edit.available !== undefined) set.available = edit.available;
        if (edit.amount !== undefined) set.amount = String(edit.amount);
        if (Object.keys(set).length === 0) continue;

        const rows = await tx
          .update(schema.rateBenefits)
          .set(set)
          .where(
            and(
              eq(schema.rateBenefits.id, edit.id),
              // Scoped to this card, so an id from another card can't be edited.
              eq(schema.rateBenefits.rateCardId, rateCardId),
            ),
          )
          .returning({ id: schema.rateBenefits.id });
        applied += rows.length;
        continue;
      }

      if (edit.table === "surcharge") {
        if (edit.percent === undefined) continue;
        const rows = await tx
          .update(schema.rateSurcharges)
          .set({ percent: String(edit.percent) })
          .where(
            and(
              eq(schema.rateSurcharges.id, edit.id),
              eq(schema.rateSurcharges.rateCardId, rateCardId),
            ),
          )
          .returning({ id: schema.rateSurcharges.id });
        applied += rows.length;
        continue;
      }

      if (edit.table === "deductible") {
        const set: Record<string, unknown> = {};
        if (edit.available !== undefined) set.available = edit.available;
        if (edit.reductionPercent !== undefined) {
          set.reductionPercent = String(edit.reductionPercent);
        }
        if (Object.keys(set).length === 0) continue;

        const rows = await tx
          .update(schema.rateDeductibles)
          .set(set)
          .where(
            and(
              eq(schema.rateDeductibles.id, edit.id),
              eq(schema.rateDeductibles.rateCardId, rateCardId),
            ),
          )
          .returning({ id: schema.rateDeductibles.id });
        applied += rows.length;
        continue;
      }

      // Restrictions hang off an area, not the card, so ownership is checked
      // through the area rather than assumed.
      const set: Record<string, unknown> = {};
      if (edit.available !== undefined) set.available = edit.available;
      if (edit.discountPercent !== undefined) set.discountPercent = String(edit.discountPercent);
      if (Object.keys(set).length === 0) continue;

      const owned = await tx
        .select({ id: schema.rateAreaRestrictions.id })
        .from(schema.rateAreaRestrictions)
        .innerJoin(
          schema.rateAreas,
          eq(schema.rateAreas.id, schema.rateAreaRestrictions.rateAreaId),
        )
        .where(
          and(
            eq(schema.rateAreaRestrictions.id, edit.id),
            eq(schema.rateAreas.rateCardId, rateCardId),
          ),
        )
        .limit(1);

      if (owned.length === 0) continue;

      const rows = await tx
        .update(schema.rateAreaRestrictions)
        .set(set)
        .where(eq(schema.rateAreaRestrictions.id, edit.id))
        .returning({ id: schema.rateAreaRestrictions.id });
      applied += rows.length;
    }
  });

  return applied;
}
