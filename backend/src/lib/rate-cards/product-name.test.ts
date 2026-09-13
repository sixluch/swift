/**
 * Run with: cd backend && npx tsx src/lib/rate-cards/product-name.test.ts
 */
import assert from "node:assert/strict";
import { productNameFromFilename, productNameFromText } from "./product-name.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test("reads the name the insurer prints in the page furniture", () => {
  assert.equal(productNameFromText(["Ages", "GLOBAL FLEX VIP", "2026"]), "Global Flex VIP");
});

test("ignores headings that aren't the product name", () => {
  assert.equal(productNameFromText(["PREMIUM RATE TABLES", "OPTIONAL BENEFITS"]), null);
  assert.equal(productNameFromText([]), null);
});

test("falls back to the filename, dropping boilerplate and the version suffix", () => {
  assert.equal(
    productNameFromFilename("Rate-Tables-Global-Flex-VIP-20262.pdf"),
    "Global Flex VIP",
  );
  assert.equal(productNameFromFilename("premium_rates_elite_care_2027.pdf"), "Elite Care");
});

test("keeps short acronyms in capitals but title-cases real words", () => {
  assert.equal(productNameFromText(["GLOBAL FLEX VIP"]), "Global Flex VIP");
  assert.equal(productNameFromFilename("acme-PPO-gold.pdf"), "Acme PPO Gold");
  // Four letters is long enough to be a word, not an acronym.
  assert.equal(productNameFromFilename("acme-GOLD-plan.pdf"), "Acme Gold Plan");
});

test("a filename with nothing usable left returns null, not an empty string", () => {
  assert.equal(productNameFromFilename("rate-tables-2026.pdf"), null);
  assert.equal(productNameFromFilename(".pdf"), null);
  assert.equal(productNameFromFilename(""), null);
});

test("a filename without the extension still works", () => {
  assert.equal(productNameFromFilename("Global-Flex"), "Global Flex");
});

console.log(`\n${passed} passed`);
