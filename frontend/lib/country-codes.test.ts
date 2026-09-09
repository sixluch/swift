/**
 * Run with: node lib/country-codes.test.ts   (Node 24 strips the types)
 * No test framework — same approach as lib/speech.test.ts.
 */
import assert from "node:assert/strict";
import { COUNTRY_CODES, dialCodeFor, guessCountryIso, toE164 } from "./country-codes.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// --- the list itself ---------------------------------------------------------
test("every ISO code is unique (select option values must not collide)", () => {
  const seen = new Set(COUNTRY_CODES.map((c) => c.iso));
  assert.equal(seen.size, COUNTRY_CODES.length);
});

test("every dial code is well formed", () => {
  for (const c of COUNTRY_CODES) {
    assert.match(c.dial, /^\+[0-9]{1,4}$/, `${c.iso} has dial "${c.dial}"`);
  }
});

test("every ISO code is two uppercase letters", () => {
  for (const c of COUNTRY_CODES) assert.match(c.iso, /^[A-Z]{2}$/);
});

test("shared dial codes are allowed and present (+1 covers several countries)", () => {
  const plusOne = COUNTRY_CODES.filter((c) => c.dial === "+1").map((c) => c.iso);
  assert.ok(plusOne.includes("US"));
  assert.ok(plusOne.includes("CA"));
  assert.ok(plusOne.length > 2, "expected +1 to be shared");
});

test("list is sorted by name, so the dropdown is scannable", () => {
  const names = COUNTRY_CODES.map((c) => c.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "en"));
  assert.deepEqual(names, sorted);
});

test("no default market is baked in — Lebanon is just one row", () => {
  assert.equal(dialCodeFor("LB"), "+961");
  assert.equal(COUNTRY_CODES[0].iso !== "LB", true);
});

// --- dialCodeFor -------------------------------------------------------------
test("dialCodeFor resolves known countries", () => {
  assert.equal(dialCodeFor("GB"), "+44");
  assert.equal(dialCodeFor("AE"), "+971");
  assert.equal(dialCodeFor("US"), "+1");
});

test("dialCodeFor returns undefined for anything unknown", () => {
  assert.equal(dialCodeFor("ZZ"), undefined);
  assert.equal(dialCodeFor(""), undefined);
});

// --- toE164 ------------------------------------------------------------------
test("joins dial code to typed digits", () => {
  assert.equal(toE164("LB", "3123456"), "+9613123456");
  assert.equal(toE164("US", "2125551234"), "+12125551234");
});

test("strips spaces, dashes, dots and parentheses", () => {
  assert.equal(toE164("GB", "7700 900-123"), "+447700900123");
  assert.equal(toE164("FR", "(6) 12.34.56.78"), "+33612345678");
});

test("drops the national trunk zero typed after a country code", () => {
  assert.equal(toE164("GB", "07700900123"), "+447700900123");
  assert.equal(toE164("DE", "0301234567"), "+49301234567");
});

test("returns empty string when no country is selected", () => {
  assert.equal(toE164("", "3123456"), "");
  assert.equal(toE164("ZZ", "3123456"), "");
});

test("returns empty string when no digits were typed", () => {
  assert.equal(toE164("LB", ""), "");
  assert.equal(toE164("LB", "   "), "");
  assert.equal(toE164("LB", "0"), "", "a lone trunk zero is not a number");
});

test("output always satisfies the backend's E.164 rule for real input", () => {
  const E164 = /^\+[0-9]{7,15}$/;
  assert.match(toE164("LB", "3 123 456"), E164);
  assert.match(toE164("AE", "50 123 4567"), E164);
  assert.match(toE164("IN", "98765 43210"), E164);
});

// --- guessCountryIso ---------------------------------------------------------
test("guessCountryIso is SSR-safe and never throws", () => {
  // `navigator` is undefined under plain Node — the guard must catch that.
  assert.equal(typeof globalThis.navigator === "undefined" ? guessCountryIso() : "", "");
});

test("guessCountryIso picks the region from a locale tag", () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { languages: ["fr", "en-GB"], language: "fr" },
    configurable: true,
  });
  assert.equal(guessCountryIso(), "GB", "should skip region-less 'fr' and take 'en-GB'");

  Object.defineProperty(globalThis, "navigator", {
    value: { languages: ["xx-ZZ"], language: "xx-ZZ" },
    configurable: true,
  });
  assert.equal(guessCountryIso(), "", "unknown region must not be guessed");

  if (original === undefined) {
    // @ts-expect-error restoring the absent global
    delete globalThis.navigator;
  } else {
    Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
  }
});

console.log(`\n${passed} passed`);
