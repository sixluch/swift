/**
 * Run with: cd backend && node src/lib/rate-cards/vumi-parser.test.ts
 *
 * Synthetic pages, not the real PDF — these lock the *rules* (which area owns
 * which table, what happens to a broken row) so a refactor can't quietly
 * reintroduce a mispairing. The real PDF is verified separately against the
 * printed rate card.
 */
import assert from "node:assert/strict";
import { parseVumiRateCard } from "./vumi-parser.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const BENEFITS = [
  "OPTIONAL BENEFITS",
  "Extended Evacuation",
  "$75",
  "Wellness and Optical - $500",
  "$300",
  "Outpatient Treatment - $5,000",
  "65%",
];

const SURCHARGES = ["ADDITIONAL SURCHARGES", "Annual", "0%", "Monthly", "6%"];

const DEDUCTIBLES = [
  "DEDUCTIBLE, OUTPATIENT PER VISIT EXCESS AND OUTPATIENT COINSURANCE",
  "Excess per person",
  "Premium reduction",
  "-",
  "0%",
  "$1,000",
  "10.0%",
  "$15 Outpatient Per Visit Excess",
  "4.5%",
  "10% Outpatient Coinsurance, up to a maximum of $2,000 out-of-pocket",
  "7.5%",
];

/** Two age bands is enough to prove the walk; the real card has fourteen. */
function areaPage(areaCode: string, base: number, extra: string[] = []): string[] {
  return [
    "PREMIUM RATE TABLES",
    `Area ${areaCode}`,
    "Ages",
    "TOTAL",
    "ULTRA",
    "SUPERIOR",
    "STANDARD",
    "BASIC",
    "0 - 5",
    `$${base}`,
    `$${base + 1}`,
    `$${base + 2}`,
    `$${base + 3}`,
    `$${base + 4}`,
    "75 - 79",
    `$${base + 10}`,
    `$${base + 11}`,
    `$${base + 12}`,
    `$${base + 13}`,
    `$${base + 14}`,
    ...BENEFITS,
    ...DEDUCTIBLES,
    ...SURCHARGES,
    ...extra,
    "*Annual Premium",
    "GLOBAL FLEX VIP",
    "2026",
  ];
}

const COUNTRY_PAGE = [
  "PREMIUM RATE TABLES",
  "Countries by Area",
  "AREA 1",
  "USA",
  "AREA 3",
  "Lebanon",
  "Netherlands Antilles",
  "AREA 6",
  "Democratic Republic",
  "of the Congo",
  "Palestine",
  "(West Bank & Gaza)",
  "Malta",
  "St Vincent & The Grenadines",
];

test("each area keeps its own premiums, whatever order the page emits them in", () => {
  const r = parseVumiRateCard([areaPage("1", 8000), areaPage("3", 4000)], "Global Flex VIP");
  assert.deepEqual(
    r.areas.map((a) => a.areaCode),
    ["1", "3"],
  );
  assert.equal(r.areas[0].premiums[0].amounts.TOTAL, 8000);
  assert.equal(r.areas[1].premiums[0].amounts.TOTAL, 4000);
  // The heading sits before its tables here; the real card has it after on some
  // pages. Grouping by page is what makes both work.
  assert.equal(r.areas[0].premiums[0].amounts.BASIC, 8004);
  assert.equal(r.areas[1].premiums.at(-1)?.amounts.TOTAL, 4010);
});

test("age bands and plan order are read from the table, not assumed", () => {
  const r = parseVumiRateCard([areaPage("1", 100)], "x");
  const [first, last] = [r.areas[0].premiums[0], r.areas[0].premiums.at(-1)!];
  assert.deepEqual([first.ageMin, first.ageMax], [0, 5]);
  assert.deepEqual([last.ageMin, last.ageMax], [75, 79]);
  assert.deepEqual(Object.keys(first.amounts), ["TOTAL", "ULTRA", "SUPERIOR", "STANDARD", "BASIC"]);
});

test("a benefit's unit follows its value: dollars or a percentage loading", () => {
  const r = parseVumiRateCard([areaPage("1", 100)], "x");
  const wellness = r.benefits.find((b) => b.label.startsWith("Wellness"))!;
  const outpatient = r.benefits.find((b) => b.label.startsWith("Outpatient"))!;
  assert.deepEqual([wellness.amount, wellness.unit], [300, "currency"]);
  // "$5,000" is part of the label; 65% is the value.
  assert.deepEqual([outpatient.amount, outpatient.unit], [65, "percent"]);
});

test("the footnote eligibility rules are attached to the benefits they restrict", () => {
  const r = parseVumiRateCard([areaPage("1", 100)], "x");
  assert.deepEqual(r.benefits.find((b) => b.label.startsWith("Wellness"))!.excludedPlans, ["BASIC"]);
  assert.deepEqual(r.benefits.find((b) => b.label.startsWith("Outpatient"))!.onlyPlans, ["BASIC"]);
  assert.deepEqual(r.benefits.find((b) => b.label.startsWith("Extended"))!.excludedPlans, []);
});

test("the deductible table splits into its three kinds", () => {
  const r = parseVumiRateCard([areaPage("1", 100)], "x");
  assert.deepEqual(
    r.deductibles.map((d) => d.kind),
    ["deductible", "deductible", "outpatient_excess", "outpatient_coinsurance"],
  );
  assert.equal(r.deductibles[0].label, "No deductible");
  assert.equal(r.deductibles[0].reductionPercent, 0);
  assert.equal(r.deductibles[1].reductionPercent, 10);
  // Coinsurance is not available in Basic.
  assert.deepEqual(r.deductibles.at(-1)!.excludedPlans, ["BASIC"]);
});

test("payment surcharges are read as percentages", () => {
  const r = parseVumiRateCard([areaPage("1", 100)], "x");
  assert.deepEqual(r.surcharges, [
    { label: "Annual", percent: 0 },
    { label: "Monthly", percent: 6 },
  ]);
});

test("coverage-restriction discounts stay with the area that prints them", () => {
  const pages = [
    areaPage("1", 8000),
    areaPage("6", 3000, ["DISCOUNT FOR COVERAGE RESTRICTION", "Africa", "23.5%"]),
  ];
  const r = parseVumiRateCard(pages, "x");
  assert.deepEqual(r.areas.find((a) => a.areaCode === "1")!.restrictions, []);
  assert.deepEqual(r.areas.find((a) => a.areaCode === "6")!.restrictions, [
    { region: "Africa", discountPercent: 23.5 },
  ]);
});

test("countries map to their area, and wrapped names are rejoined", () => {
  const r = parseVumiRateCard([areaPage("1", 100), COUNTRY_PAGE], "x");
  const find = (name: string) => r.countries.find((c) => c.printedName === name);

  assert.equal(find("USA")?.iso, "US");
  assert.equal(find("USA")?.areaCode, "1");
  assert.equal(find("Lebanon")?.areaCode, "3");
  // Column wrapping split these across two lines in the PDF.
  assert.equal(find("Democratic Republic of the Congo")?.iso, "CD");
  assert.equal(find("Palestine (West Bank & Gaza)")?.iso, "PS");
  // A trailing space is not a continuation marker: "Malta " must stay separate.
  assert.equal(find("Malta")?.iso, "MT");
  assert.equal(find("St Vincent & The Grenadines")?.iso, "VC");
});

test("an unresolvable country is kept with a null code and warned about, not dropped", () => {
  const r = parseVumiRateCard([areaPage("1", 100), COUNTRY_PAGE], "x");
  const antilles = r.countries.find((c) => c.printedName === "Netherlands Antilles");
  assert.ok(antilles, "the row must still exist");
  assert.equal(antilles.iso, null);
  assert.ok(r.warnings.some((w) => w.includes("Netherlands Antilles")));
});

test("a short premium row is skipped with a warning rather than stored half-read", () => {
  const broken = areaPage("1", 100);
  // Remove the last plan's premium from the first band.
  broken.splice(broken.indexOf("$104"), 1);
  const r = parseVumiRateCard([broken], "x");
  assert.equal(r.areas[0].premiums.length, 1, "only the intact band survives");
  assert.ok(r.warnings.some((w) => /0–5 had 4 of 5 premiums/.test(w)));
});

test("a difference between areas in a repeated table is reported, not averaged away", () => {
  const changed = areaPage("3", 4000).map((l) => (l === "6%" ? "9%" : l));
  const r = parseVumiRateCard([areaPage("1", 8000), changed], "x");
  assert.ok(r.warnings.some((w) => /payment surcharge table is not identical/.test(w)));
});

test("no pages at all is refused with an explanation, not an empty success", () => {
  const r = parseVumiRateCard([], "x");
  assert.equal(r.areas.length, 0);
  assert.ok(r.warnings.some((w) => /page structure could not be read/.test(w)));
});

test("a PDF with pages but no area headings is called out", () => {
  const r = parseVumiRateCard([["Some other insurer's brochure", "Hello"]], "x");
  assert.ok(r.warnings.some((w) => /does not look like a VUMI/.test(w)));
});

test("premiums are annual and in USD, as printed", () => {
  const r = parseVumiRateCard([areaPage("1", 100)], "Global Flex VIP");
  assert.equal(r.premiumBasis, "annual");
  assert.equal(r.currency, "USD");
  assert.equal(r.productName, "Global Flex VIP");
});

console.log(`\n${passed} passed`);
