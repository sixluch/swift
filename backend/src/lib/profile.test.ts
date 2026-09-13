/**
 * Run with: cd backend && node src/lib/profile.test.ts
 * No test framework — Node 24 strips the types.
 */
import assert from "node:assert/strict";
import {
  EMPTY_PROFILE,
  coverageForTier,
  dependantAges,
  describeDependants,
  hasSubmittedProfile,
  type Dependant,
  type Profile,
} from "./profile.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const profile = (patch: Partial<Profile> = {}): Profile => ({ ...EMPTY_PROFILE, ...patch });

const household: Dependant[] = [
  { relation: "spouse", age: 42, gender: "female" },
  { relation: "child", age: 10, gender: "male" },
  { relation: "child", age: 7, gender: "female" },
];

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

// --- dependants ---------------------------------------------------------------
test("dependant ages keep the order they were added in", () => {
  assert.deepEqual(dependantAges(household), [42, 10, 7]);
  assert.deepEqual(dependantAges([]), []);
});

test("household reads back as one line for the prompt and the CSV", () => {
  assert.equal(describeDependants(household), "Spouse 42 (F), Child 10 (M), Child 7 (F)");
  assert.equal(describeDependants([]), "");
});

// --- submitted or not ---------------------------------------------------------
test("an empty profile has not been submitted", () => {
  assert.equal(hasSubmittedProfile(profile()), false);
});

test("age 0 counts as submitted — a newborn is a real applicant", () => {
  const p = profile({ fullName: "Baby", country: "LB", age: 0, coverageTier: "inpatient" });
  assert.equal(hasSubmittedProfile(p), true, "age 0 must not read as unanswered");
});

console.log(`\n${passed} passed`);
