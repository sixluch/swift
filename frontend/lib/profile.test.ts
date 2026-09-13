/**
 * Run with: cd frontend && npx tsx lib/profile.test.ts
 * (tsx, not bare node: quote-form.ts imports "./profile" without an extension.)
 * Guards the pieces of the quote form that decide what gets submitted.
 */
import assert from "node:assert/strict";
import { TIER_COVERAGE, describeDependants, genderLabel } from "./profile.ts";
import {
  EMPTY_DRAFT,
  draftFromProfile,
  newDependant,
  todayIso,
  validateQuoteForm,
  type QuoteFormDraft,
} from "./quote-form.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TODAY = "2026-09-12";

const complete: QuoteFormDraft = {
  fullName: "  Nabil  ",
  country: "LB",
  nationality: "FR",
  effectiveDate: "2026-10-01",
  age: "34",
  gender: "male",
  dependants: [
    { ...newDependant("spouse"), age: "32", gender: "female" },
    { ...newDependant("child"), age: "5", gender: "male" },
  ],
  coverageTier: "inpatient_outpatient",
};

// --- validation ---------------------------------------------------------------
test("an empty draft reports every required field", () => {
  const result = validateQuoteForm(EMPTY_DRAFT, TODAY);
  assert.equal(result.profile, null);
  assert.deepEqual(Object.keys(result.errors!).sort(), [
    "age",
    "country",
    "coverageTier",
    "effectiveDate",
    "fullName",
    "gender",
    "nationality",
  ]);
});

test("a complete draft becomes a typed profile, trimmed and numeric", () => {
  const result = validateQuoteForm(complete, TODAY);
  assert.equal(result.errors, null);
  assert.deepEqual(result.profile, {
    fullName: "Nabil",
    country: "LB",
    nationality: "FR",
    effectiveDate: "2026-10-01",
    age: 34,
    gender: "male",
    dependants: [
      { relation: "spouse", age: 32, gender: "female" },
      { relation: "child", age: 5, gender: "male" },
    ],
    coverageTier: "inpatient_outpatient",
  });
});

test("today is an acceptable start date, yesterday is not", () => {
  assert.equal(validateQuoteForm({ ...complete, effectiveDate: TODAY }, TODAY).errors, null);
  const past = validateQuoteForm({ ...complete, effectiveDate: "2026-09-11" }, TODAY);
  assert.ok(past.errors?.effectiveDate);
});

test("age 0 is a real applicant; 121 and text are not", () => {
  assert.equal(validateQuoteForm({ ...complete, age: "0" }, TODAY).errors, null);
  assert.ok(validateQuoteForm({ ...complete, age: "121" }, TODAY).errors?.age);
  assert.ok(validateQuoteForm({ ...complete, age: "abc" }, TODAY).errors?.age);
});

test("a dependant row is flagged by its own index", () => {
  const draft: QuoteFormDraft = {
    ...complete,
    dependants: [
      { ...newDependant("spouse"), age: "32", gender: "female" },
      { ...newDependant("child"), age: "", gender: "" },
      { ...newDependant("child"), age: "9", gender: "" },
    ],
  };
  const result = validateQuoteForm(draft, TODAY);
  assert.equal(result.errors?.["dependants.0"], undefined);
  assert.ok(result.errors?.["dependants.1"]);
  assert.equal(result.errors?.["dependants.2"], "Pick boy or girl.");
});

test("the household is capped so one submission can't explode the price", () => {
  const rows = Array.from({ length: 11 }, () => ({
    ...newDependant("child"),
    age: "4",
    gender: "male" as const,
  }));
  assert.ok(validateQuoteForm({ ...complete, dependants: rows }, TODAY).errors?.dependants);
});

test("dependant rows get distinct keys", () => {
  const a = newDependant("child");
  const b = newDependant("child");
  assert.notEqual(a.id, b.id);
});

// --- round trip for Edit ------------------------------------------------------
test("a submitted profile round-trips back into an editable draft", () => {
  const { profile } = validateQuoteForm(complete, TODAY);
  const draft = draftFromProfile(profile!);
  assert.deepEqual(validateQuoteForm(draft, TODAY).profile, profile);
});

// --- helpers ------------------------------------------------------------------
test("todayIso uses local calendar fields, zero-padded", () => {
  assert.equal(todayIso(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("children are labelled boy/girl, everyone else male/female", () => {
  assert.equal(genderLabel("male", "child"), "Boy");
  assert.equal(genderLabel("female", "child"), "Girl");
  assert.equal(genderLabel("female", "spouse"), "Female");
  assert.equal(genderLabel("male", "applicant"), "Male");
});

test("household reads back as one line, matching the backend", () => {
  assert.equal(
    describeDependants([
      { relation: "spouse", age: 42, gender: "female" },
      { relation: "child", age: 10, gender: "male" },
    ]),
    "Spouse 42 (F), Child 10 (M)",
  );
});

test("tiers are cumulative", () => {
  const order = ["inpatient", "inpatient_outpatient", "dental", "maternity"] as const;
  order.forEach((tier, i) => {
    if (i === 0) return;
    const previous = TIER_COVERAGE[order[i - 1]];
    assert.ok(previous.every((c) => TIER_COVERAGE[tier].includes(c)), `${tier} drops cover`);
  });
});

console.log(`\n${passed} passed`);
