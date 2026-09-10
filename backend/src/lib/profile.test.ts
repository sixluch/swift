/**
 * Run with: cd backend && node src/lib/profile.test.ts
 * No test framework — Node 24 strips the types.
 */
import assert from "node:assert/strict";
import {
  EMPTY_PROFILE,
  coverageForTier,
  isReadyForQuotes,
  missingForQuotes,
  nextSlot,
  type Profile,
} from "./profile.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const profile = (patch: Partial<Profile> = {}): Profile => ({ ...EMPTY_PROFILE, ...patch });

/** Walks the flow the way a real conversation does, one answer at a time. */
function walk(answers: Partial<Profile>[], quotesShownAfter = Infinity): (string | null)[] {
  let current = profile();
  const seen: (string | null)[] = [nextSlot(current, false)];
  answers.forEach((answer, i) => {
    current = { ...current, ...answer };
    seen.push(nextSlot(current, i + 1 >= quotesShownAfter));
  });
  return seen;
}

// --- the mandatory order ------------------------------------------------------
test("asks for the name first, on an empty profile", () => {
  assert.equal(nextSlot(profile(), false), "fullName");
});

test("individual flow follows the client's exact order", () => {
  const seen = walk([
    { fullName: "Nabil" },
    { country: "LB" },
    { nationality: "LB" },
    { age: 34 },
    { planType: "individual" },
    { coverageTier: "dental" },
  ]);

  assert.deepEqual(seen, [
    "fullName",
    "country",
    "nationality",
    "age",
    "planType",
    "coverageTier",
    null, // everything collected — time to call getQuotes
  ]);
});

test("family flow inserts the ages question before cover", () => {
  const seen = walk([
    { fullName: "Nabil" },
    { country: "AE" },
    { nationality: "LB" },
    { age: 40 },
    { planType: "family" },
    { familyAges: "partner 42, kids 10 and 7" },
    { coverageTier: "maternity" },
  ]);

  assert.deepEqual(seen, [
    "fullName",
    "country",
    "nationality",
    "age",
    "planType",
    "familyAges",
    "coverageTier",
    null,
  ]);
});

test("family ages are never asked of an individual", () => {
  const p = profile({
    fullName: "A",
    country: "LB",
    nationality: "LB",
    age: 30,
    planType: "individual",
  });
  assert.equal(nextSlot(p, false), "coverageTier");
});

test("switching from individual to family reopens the ages question", () => {
  const done = profile({
    fullName: "A",
    country: "LB",
    nationality: "LB",
    age: 30,
    planType: "individual",
    coverageTier: "inpatient",
  });
  assert.equal(nextSlot(done, false), null);
  assert.equal(nextSlot({ ...done, planType: "family" }, false), "familyAges");
});

// --- delivery comes last, and only after quotes -------------------------------
const collected = profile({
  fullName: "Nabil",
  country: "LB",
  nationality: "LB",
  age: 34,
  planType: "individual",
  coverageTier: "dental",
});

test("delivery is NOT asked before quotes exist", () => {
  assert.equal(nextSlot(collected, false), null);
});

test("delivery is asked once quotes exist", () => {
  assert.equal(nextSlot(collected, true), "deliveryChannel");
});

test("nothing left to ask once delivery is chosen", () => {
  assert.equal(nextSlot({ ...collected, deliveryChannel: "whatsapp" }, true), null);
});

// --- the quote gate -----------------------------------------------------------
test("not ready for quotes until every slot is filled", () => {
  assert.equal(isReadyForQuotes(profile()), false);
  assert.equal(isReadyForQuotes(profile({ fullName: "A", age: 30 })), false);
  assert.equal(isReadyForQuotes(collected), true);
});

test("a family without ages is not ready, even with everything else", () => {
  const p = { ...collected, planType: "family" as const };
  assert.equal(isReadyForQuotes(p), false);
  assert.equal(isReadyForQuotes({ ...p, familyAges: "partner 42" }), true);
});

test("missingForQuotes lists gaps in order and excludes delivery", () => {
  assert.deepEqual(missingForQuotes(profile({ fullName: "A" })), [
    "country",
    "nationality",
    "age",
    "planType",
    "coverageTier",
  ]);
  assert.deepEqual(missingForQuotes(collected), []);
});

// --- tiers are cumulative -----------------------------------------------------
test("each tier includes everything below it", () => {
  assert.deepEqual(coverageForTier("inpatient"), ["inpatient"]);
  assert.deepEqual(coverageForTier("inpatient_outpatient"), ["inpatient", "outpatient"]);
  assert.deepEqual(coverageForTier("dental"), ["inpatient", "outpatient", "dental"]);
  assert.deepEqual(coverageForTier("maternity"), [
    "inpatient",
    "outpatient",
    "dental",
    "maternity",
  ]);
  assert.deepEqual(coverageForTier(null), []);
});

test("age 0 counts as answered — a newborn is a real applicant", () => {
  const p = profile({
    fullName: "Baby",
    country: "LB",
    nationality: "LB",
    age: 0,
    planType: "individual",
    coverageTier: "inpatient",
  });
  assert.equal(isReadyForQuotes(p), true, "age 0 must not read as unanswered");
});

console.log(`\n${passed} passed`);
