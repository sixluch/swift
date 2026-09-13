/**
 * Run with: cd backend && npx tsx src/lib/countries.test.ts
 * Guards the name → ISO resolution the rate-card area map depends on.
 */
import assert from "node:assert/strict";
import {
  COUNTRIES,
  isSelectableIso,
  normalizeCountryName,
  resolveCountryIso,
} from "./countries.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test("the list mirrors the frontend's, and every row is well formed", () => {
  assert.equal(COUNTRIES.length, 205, "out of step with frontend/lib/country-codes.ts");
  for (const [iso, name] of COUNTRIES) {
    assert.match(iso, /^[A-Z]{2}$/, `bad code: ${iso}`);
    assert.ok(name.length > 1, `bad name for ${iso}`);
  }
  assert.equal(new Set(COUNTRIES.map(([iso]) => iso)).size, COUNTRIES.length, "duplicate code");
});

test("a stop word is never stripped from inside another word", () => {
  // "st" inside "usa" was removed by a \b-less regex, giving "u a".
  assert.equal(normalizeCountryName("USA"), "usa");
  assert.equal(normalizeCountryName("Austria"), "austria");
  assert.equal(normalizeCountryName("Estonia"), "estonia");
  assert.equal(normalizeCountryName("Oman"), "oman");
});

test("stop words between words are stripped", () => {
  assert.equal(normalizeCountryName("Democratic Republic of the Congo"), "democratic republic congo");
  assert.equal(normalizeCountryName("St Lucia"), "lucia");
});

test("accents and ampersands normalise", () => {
  assert.equal(normalizeCountryName("Türkiye"), "turkiye");
  assert.equal(normalizeCountryName("Côte d'Ivoire"), "cote d ivoire");
  assert.equal(normalizeCountryName("Antigua & Barbuda"), "antigua and barbuda");
});

test("plain names resolve straight from the list", () => {
  assert.equal(resolveCountryIso("Lebanon"), "LB");
  assert.equal(resolveCountryIso("lebanon"), "LB");
  assert.equal(resolveCountryIso("  Lebanon  "), "LB");
  assert.equal(resolveCountryIso("India"), "IN");
  assert.equal(resolveCountryIso("Ghana"), "GH");
});

test("abbreviations the insurer uses resolve", () => {
  assert.equal(resolveCountryIso("USA"), "US");
  assert.equal(resolveCountryIso("UAE"), "AE");
  assert.equal(resolveCountryIso("KSA"), "SA");
  assert.equal(resolveCountryIso("Macau SAR"), "MO");
  assert.equal(resolveCountryIso("Hong Kong"), "HK");
});

test("former and alternative names resolve", () => {
  assert.equal(resolveCountryIso("Czech Republic"), "CZ");
  assert.equal(resolveCountryIso("Turkey"), "TR");
  assert.equal(resolveCountryIso("Macedonia"), "MK");
  assert.equal(resolveCountryIso("Swaziland"), "SZ");
  assert.equal(resolveCountryIso("East Timor"), "TL");
  assert.equal(resolveCountryIso("Outer Mongolia"), "MN");
});

test("the two Congos stay distinct", () => {
  assert.equal(resolveCountryIso("Democratic Republic of the Congo"), "CD");
  assert.equal(resolveCountryIso("Republic of The Congo"), "CG");
});

test("the insurer's own typo resolves", () => {
  assert.equal(resolveCountryIso("Papa New Guinea"), "PG");
});

test("an unknown name returns null instead of a guess", () => {
  assert.equal(resolveCountryIso("Netherlands Antilles"), null);
  assert.equal(resolveCountryIso("Atlantis"), null);
  assert.equal(resolveCountryIso(""), null);
  assert.equal(resolveCountryIso("   "), null);
});

test("codes VUMI covers but the lead gate cannot offer are flagged as unselectable", () => {
  assert.equal(isSelectableIso("LB"), true);
  assert.equal(isSelectableIso("US"), true);
  // Small territories missing from the dial-code list.
  assert.equal(isSelectableIso("CC"), false);
  assert.equal(isSelectableIso("PW"), false);
});

console.log(`\n${passed} passed`);
