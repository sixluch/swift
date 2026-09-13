import { resolveCountryIso } from "../countries.js";

/**
 * Parser for VUMI's "Premium Rate Tables" layout (Global Flex VIP 2026).
 *
 * Deterministic on purpose. The text layer of these rate cards is intact, so
 * there is nothing for a language model to infer — and a wrong premium is worse
 * than no premium, so guessing is never the right trade. Anything the parser
 * cannot account for goes into `warnings` for the admin to see.
 *
 * It works from **pages**, not from a flat line stream. One sheet of paper holds
 * one area's heading and that area's tables; the content-stream order does not
 * reliably reflect that (on this card some headings are emitted before their own
 * tables and some after), and a mispaired heading is a wrong price for a whole
 * country group.
 */

export const VUMI_PLANS = [
  { code: "TOTAL", label: "Total" },
  { code: "ULTRA", label: "Ultra" },
  { code: "SUPERIOR", label: "Superior" },
  { code: "STANDARD", label: "Standard" },
  { code: "BASIC", label: "Basic" },
] as const;

export type BenefitUnit = "currency" | "percent";
export type DeductibleKind = "deductible" | "outpatient_excess" | "outpatient_coinsurance";

export interface ParsedPremium {
  ageMin: number;
  ageMax: number;
  /** Plan code → annual premium. */
  amounts: Record<string, number>;
}

/** A discount for restricting cover to one region, e.g. "Africa −23.5%". */
export interface ParsedRestriction {
  region: string;
  discountPercent: number;
}

export interface ParsedArea {
  areaCode: string;
  premiums: ParsedPremium[];
  restrictions: ParsedRestriction[];
}

export interface ParsedBenefit {
  label: string;
  amount: number;
  unit: BenefitUnit;
  /** Plan codes this cannot be combined with, from the PDF's footnotes. */
  excludedPlans: string[];
  /** Plan codes this is exclusive to. */
  onlyPlans: string[];
}

export interface ParsedSurcharge {
  label: string;
  percent: number;
}

export interface ParsedDeductible {
  kind: DeductibleKind;
  label: string;
  reductionPercent: number;
  excludedPlans: string[];
}

export interface ParsedCountry {
  areaCode: string;
  printedName: string;
  iso: string | null;
}

export interface ParsedRateCard {
  productName: string;
  currency: string;
  premiumBasis: "annual";
  areas: ParsedArea[];
  plans: ReadonlyArray<{ code: string; label: string }>;
  benefits: ParsedBenefit[];
  surcharges: ParsedSurcharge[];
  deductibles: ParsedDeductible[];
  countries: ParsedCountry[];
  warnings: string[];
}

const AREA_LABEL = /^Area (\d+)$/;
const AREA_HEADING = /^AREA (\d+)/;
const AGE_BAND = /^(\d+)\s*-\s*(\d+)$/;
const MONEY = /^\$\s*([\d,]+)$/;
const PERCENT = /^([\d.]+)\s*%$/;

const OPTIONAL_BENEFITS = "OPTIONAL BENEFITS";
const SURCHARGES = "ADDITIONAL SURCHARGES";
const DEDUCTIBLES = "DEDUCTIBLE, OUTPATIENT PER VISIT EXCESS AND OUTPATIENT COINSURANCE";
const RESTRICTIONS = "DISCOUNT FOR COVERAGE RESTRICTION";
const RATE_TABLE = "PREMIUM RATE TABLES";
const COUNTRY_SECTION = "Countries by Area";

/** Any of these ends the section before it. */
const SECTION_HEADERS = new Set([
  OPTIONAL_BENEFITS,
  SURCHARGES,
  DEDUCTIBLES,
  RESTRICTIONS,
  RATE_TABLE,
  COUNTRY_SECTION,
  "Ages",
]);

/** Column headings inside a table, skipped rather than read as a label. */
const COLUMN_HEADERS = new Set(["Excess per person", "Premium reduction", "Ages"]);

function money(line: string): number | null {
  const m = MONEY.exec(line);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

function percent(line: string): number | null {
  const m = PERCENT.exec(line);
  return m ? Number(m[1]) : null;
}

/**
 * `$5,000` in the benefits table is part of a *label* ("Outpatient Treatment −
 * $5,000") while `65%` is that row's value, so a benefit's unit is whichever
 * form its value line takes.
 */
function benefitValue(line: string): { amount: number; unit: BenefitUnit } | null {
  const asMoney = money(line);
  if (asMoney !== null) return { amount: asMoney, unit: "currency" };
  const asPercent = percent(line);
  if (asPercent !== null) return { amount: asPercent, unit: "percent" };
  return null;
}

function isNoise(line: string): boolean {
  return (
    line.startsWith("*") ||
    line === "VUMI" ||
    line === "®" ||
    line === "GROUP" ||
    line === "GLOBAL FLEX VIP" ||
    line === "Coinsurance are not available in Basic." ||
    AREA_LABEL.test(line) ||
    VUMI_PLANS.some((p) => line.toUpperCase() === p.code) ||
    /^\d{4}$/.test(line) ||
    /vumigroup|vumiglobal|Phone number|Fax number|Office \d|Administration services|Effective/i.test(
      line,
    )
  );
}

/** The lines belonging to one table: from its heading to the next heading of any kind. */
function sectionSlice(page: string[], header: string): string[] {
  const start = page.indexOf(header);
  if (start === -1) return [];

  let end = page.length;
  for (let i = start + 1; i < page.length; i++) {
    if (SECTION_HEADERS.has(page[i]) || AGE_BAND.test(page[i])) {
      end = i;
      break;
    }
  }

  return page.slice(start + 1, end);
}

/** Reads a two-column table as label/value pairs. */
function readPairs(slice: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  let label: string | null = null;

  for (const line of slice) {
    if (isNoise(line) || COLUMN_HEADERS.has(line)) continue;

    if (label === null) label = line;
    else {
      pairs.push([label, line]);
      label = null;
    }
  }

  return pairs;
}

function parsePremiums(page: string[], areaCode: string, warnings: string[]): ParsedPremium[] {
  const premiums: ParsedPremium[] = [];

  for (let i = 0; i < page.length; i++) {
    const band = AGE_BAND.exec(page[i]);
    if (!band) continue;

    const amounts: Record<string, number> = {};
    let cursor = i + 1;

    for (const plan of VUMI_PLANS) {
      while (cursor < page.length && isNoise(page[cursor])) cursor++;
      const value = cursor < page.length ? money(page[cursor]) : null;
      if (value === null) break;
      amounts[plan.code] = value;
      cursor++;
    }

    if (Object.keys(amounts).length !== VUMI_PLANS.length) {
      warnings.push(
        `Area ${areaCode}: age band ${band[1]}–${band[2]} had ${Object.keys(amounts).length} of ${VUMI_PLANS.length} premiums and was skipped.`,
      );
      continue;
    }

    premiums.push({ ageMin: Number(band[1]), ageMax: Number(band[2]), amounts });
    i = cursor - 1;
  }

  return premiums;
}

// From the PDF's footnotes, encoded so a later calculator cannot offer an
// impossible combination.
const BENEFIT_RULES: Array<{ match: RegExp; excludedPlans?: string[]; onlyPlans?: string[] }> = [
  { match: /wellness and optical/i, excludedPlans: ["BASIC"] },
  { match: /outpatient treatment/i, onlyPlans: ["BASIC"] },
];

function parseBenefits(page: string[], areaCode: string, warnings: string[]): ParsedBenefit[] {
  const benefits: ParsedBenefit[] = [];

  for (const [label, raw] of readPairs(sectionSlice(page, OPTIONAL_BENEFITS))) {
    const value = benefitValue(raw);
    if (!value) {
      warnings.push(`Area ${areaCode}: optional benefit "${label}" had an unreadable value ("${raw}").`);
      continue;
    }
    const rule = BENEFIT_RULES.find((r) => r.match.test(label));
    benefits.push({
      label: label.replace(/\s+/g, " ").trim(),
      amount: value.amount,
      unit: value.unit,
      excludedPlans: rule?.excludedPlans ?? [],
      onlyPlans: rule?.onlyPlans ?? [],
    });
  }

  return benefits;
}

function parseSurcharges(page: string[], areaCode: string, warnings: string[]): ParsedSurcharge[] {
  const surcharges: ParsedSurcharge[] = [];

  for (const [label, raw] of readPairs(sectionSlice(page, SURCHARGES))) {
    const value = percent(raw);
    if (value === null) {
      warnings.push(`Area ${areaCode}: payment surcharge "${label}" had an unreadable value ("${raw}").`);
      continue;
    }
    surcharges.push({ label: label.replace(/\s+/g, " ").trim(), percent: value });
  }

  return surcharges;
}

function parseRestrictions(page: string[], areaCode: string, warnings: string[]): ParsedRestriction[] {
  const restrictions: ParsedRestriction[] = [];

  for (const [label, raw] of readPairs(sectionSlice(page, RESTRICTIONS))) {
    const value = percent(raw);
    if (value === null) {
      warnings.push(`Area ${areaCode}: coverage restriction "${label}" had an unreadable value ("${raw}").`);
      continue;
    }
    restrictions.push({ region: label.replace(/\s+/g, " ").trim(), discountPercent: value });
  }

  return restrictions;
}

/** VUMI misprints "Coinsurance" as "Consurance" on one area's page. */
function fixCoinsurance(label: string): string {
  return label.replace(/consurance/gi, "Coinsurance");
}

function deductibleKind(label: string): DeductibleKind {
  if (/coinsurance|consurance/i.test(label)) return "outpatient_coinsurance";
  if (/per visit excess/i.test(label)) return "outpatient_excess";
  return "deductible";
}

function parseDeductibles(page: string[], areaCode: string, warnings: string[]): ParsedDeductible[] {
  const rows: ParsedDeductible[] = [];

  for (const [label, raw] of readPairs(sectionSlice(page, DEDUCTIBLES))) {
    const value = percent(raw);
    if (value === null) {
      warnings.push(`Area ${areaCode}: deductible row "${label}" had an unreadable value ("${raw}").`);
      continue;
    }
    const kind = deductibleKind(label);
    rows.push({
      kind,
      label: label === "-" ? "No deductible" : fixCoinsurance(label.replace(/\s+/g, " ").trim()),
      reductionPercent: value,
      // "Coinsurance are not available in Basic."
      excludedPlans: kind === "outpatient_coinsurance" ? ["BASIC"] : [],
    });
  }

  return rows;
}

function parseCountries(pages: string[][], warnings: string[]): ParsedCountry[] {
  const countryPages = pages.filter((page) => page.includes(COUNTRY_SECTION));
  if (countryPages.length === 0) {
    warnings.push('No "Countries by Area" page was found, so no country was mapped to an area.');
    return [];
  }

  const countries: ParsedCountry[] = [];
  const seen = new Set<string>();
  let areaCode: string | null = null;

  for (const page of countryPages) {
    // A country name never starts with a lowercase letter or a bracket, so a
    // line that does is the tail of the one before it, wrapped by the PDF's
    // columns ("Democratic Republic" / "of the Congo"). A trailing space is NOT
    // a usable signal — plenty of complete names carry one.
    const joined: string[] = [];
    for (const line of page) {
      if (line === COUNTRY_SECTION || line === RATE_TABLE || isNoise(line)) continue;

      if (joined.length > 0 && /^[a-z(]/.test(line)) {
        joined[joined.length - 1] = `${joined[joined.length - 1]} ${line}`;
      } else {
        joined.push(line);
      }
    }

    for (const line of joined) {
      const heading = AREA_HEADING.exec(line);
      if (heading) {
        areaCode = heading[1];
        continue;
      }
      if (!areaCode) continue;

      const printedName = line.replace(/\s+/g, " ").trim();
      const key = `${areaCode}:${printedName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const iso = resolveCountryIso(printedName);
      if (!iso) {
        warnings.push(`Could not match "${printedName}" (Area ${areaCode}) to a country code.`);
      }
      countries.push({ areaCode, printedName, iso });
    }
  }

  return countries;
}

/** Compares the tables each area repeats, so a real difference is not flattened silently. */
function checkIdentical(name: string, perArea: Map<string, unknown>, warnings: string[]): void {
  const shapes = new Map<string, string[]>();
  for (const [areaCode, value] of perArea) {
    const key = JSON.stringify(value);
    shapes.set(key, [...(shapes.get(key) ?? []), areaCode]);
  }
  if (shapes.size > 1) {
    const groups = [...shapes.values()].map((areas) => `Area ${areas.join("/")}`).join(" vs ");
    warnings.push(
      `The ${name} table is not identical across areas (${groups}); the first was stored. Check it before quoting.`,
    );
  }
}

export function parseVumiRateCard(pages: string[][], productName: string): ParsedRateCard {
  const warnings: string[] = [];

  if (pages.length === 0) {
    warnings.push(
      "The PDF's page structure could not be read, so no area could be matched to its rates. If this is a scanned rate card it has no text to extract.",
    );
  }

  const areas: ParsedArea[] = [];
  const benefitsByArea = new Map<string, ParsedBenefit[]>();
  const surchargesByArea = new Map<string, ParsedSurcharge[]>();
  const deductiblesByArea = new Map<string, ParsedDeductible[]>();

  for (const page of pages) {
    const label = page.map((l) => AREA_LABEL.exec(l)).find((m) => m !== null);
    if (!label) continue;

    const areaCode = label[1];
    const premiums = parsePremiums(page, areaCode, warnings);
    if (premiums.length === 0) warnings.push(`Area ${areaCode}: no premium rows were found.`);

    areas.push({
      areaCode,
      premiums,
      restrictions: parseRestrictions(page, areaCode, warnings),
    });

    benefitsByArea.set(areaCode, parseBenefits(page, areaCode, warnings));
    surchargesByArea.set(areaCode, parseSurcharges(page, areaCode, warnings));
    deductiblesByArea.set(areaCode, parseDeductibles(page, areaCode, warnings));
  }

  if (areas.length === 0 && pages.length > 0) {
    warnings.push('No "Area N" page was found. This does not look like a VUMI Premium Rate Tables PDF.');
  }

  // Every area repeats these three tables, identical in the 2026 card, so they
  // are stored once against the rate card rather than seven times.
  checkIdentical("optional benefits", benefitsByArea, warnings);
  checkIdentical("payment surcharge", surchargesByArea, warnings);
  checkIdentical("deductible", deductiblesByArea, warnings);

  const first = <T>(map: Map<string, T[]>): T[] => [...map.values()].find((v) => v.length > 0) ?? [];

  return {
    productName,
    currency: "USD",
    premiumBasis: "annual",
    areas,
    plans: VUMI_PLANS.map((p) => ({ code: p.code, label: p.label })),
    benefits: first(benefitsByArea),
    surcharges: first(surchargesByArea),
    deductibles: first(deductiblesByArea),
    countries: parseCountries(pages, warnings),
    warnings,
  };
}
