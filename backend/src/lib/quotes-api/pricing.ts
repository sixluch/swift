import type { QuoteAddOn } from "./types.js";

/**
 * How a printed premium becomes the number on the card.
 *
 * The order is a client decision, not an arithmetic detail: a deductible
 * reduction is a discount on the *cover*, so it applies to the base premium
 * only — flat add-ons are bought at face value and are not discounted with it.
 * Percentage add-ons scale the base for the same reason (VUMI's +65% outpatient
 * is a share of the plan, not of the plan plus an evacuation rider).
 *
 *   1. base
 *   2. + percentage add-ons        (share of base)
 *   3. - deductible reduction      (share of base; one row only, never stacked)
 *   4. + flat currency add-ons
 *   5. + payment-frequency surcharge (applies to the whole)
 *
 * Worked example — VUMI Area 1, ages 30-34, Basic at 3,843, Extended
 * Evacuation (+$75) and a $1,000 deductible (-10%), paid annually:
 *   3843 - 384.3 + 75 = 3533.7 -> 3534
 */
export interface PricingInput {
  base: number;
  /** Add-ons the visitor switched on. */
  addOns?: QuoteAddOn[];
  /** Single deductible/excess/coinsurance reduction, as a percentage. */
  deductibleReductionPercent?: number;
  /** Payment-frequency loading, as a percentage. */
  surchargePercent?: number;
}

export function priceQuote(input: PricingInput): number {
  const { base, addOns = [], deductibleReductionPercent = 0, surchargePercent = 0 } = input;

  const percentAddOns = addOns
    .filter((a) => a.unit === "percent")
    .reduce((total, a) => total + a.amount, 0);

  const flatAddOns = addOns
    .filter((a) => a.unit === "currency")
    .reduce((total, a) => total + a.amount, 0);

  const scaled = base * (1 + percentAddOns / 100 - deductibleReductionPercent / 100);
  const total = (scaled + flatAddOns) * (1 + surchargePercent / 100);

  // Whole units: every surface renders these without decimals, and rounding at
  // the end keeps the displayed number equal to the number that was computed.
  return Math.round(total);
}
