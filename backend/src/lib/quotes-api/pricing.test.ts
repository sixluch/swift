import assert from "node:assert/strict";
import { priceQuote } from "./pricing.ts";

const evacuation = { id: "evac", label: "Extended Evacuation", unit: "currency", amount: 75 } as const;
const outpatient = { id: "op", label: "Outpatient Treatment", unit: "percent", amount: 65 } as const;

// Base with nothing applied is the printed premium.
assert.equal(priceQuote({ base: 3843 }), 3843);

// The worked example the client signed off on: deductible discounts the cover,
// the flat rider is then added at face value.
assert.equal(
  priceQuote({ base: 3843, addOns: [evacuation], deductibleReductionPercent: 10 }),
  3534,
);

// Ordering actually matters — discounting the rider too would give 3459.
assert.notEqual(
  priceQuote({ base: 3843, addOns: [evacuation], deductibleReductionPercent: 10 }),
  Math.round((3843 + 75) * 0.9),
);

// A percentage add-on scales the base, not the base plus flat riders.
assert.equal(priceQuote({ base: 3843, addOns: [outpatient] }), 6341);
assert.equal(priceQuote({ base: 3843, addOns: [outpatient, evacuation] }), 6416);

// Payment frequency loads the whole thing, last.
assert.equal(priceQuote({ base: 3843, surchargePercent: 6 }), 4074);
assert.equal(
  priceQuote({ base: 3843, addOns: [evacuation], surchargePercent: 6 }),
  Math.round((3843 + 75) * 1.06),
);

// A deductible never stacks with another: callers pass one figure, and 0 is a
// no-op rather than a special case.
assert.equal(priceQuote({ base: 1000, deductibleReductionPercent: 0 }), 1000);
assert.equal(priceQuote({ base: 1000, deductibleReductionPercent: 58 }), 420);

console.log("pricing.test.ts: all assertions passed");
