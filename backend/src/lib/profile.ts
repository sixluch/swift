import type { CoverageType } from "./quotes-api/types.js";

/**
 * The applicant profile the quote form collects. The form submits it whole on
 * every COMPARE (see routes/quotes.ts `POST /quotes/request`); the chat only
 * ever reads it, so the model can explain the quotes but never change them.
 */

export const COVERAGE_TIERS = [
  "inpatient",
  "inpatient_outpatient",
  "dental",
  "maternity",
] as const;
export type CoverageTier = (typeof COVERAGE_TIERS)[number];

/** Tiers are cumulative — each one includes everything below it. */
export const TIER_COVERAGE: Record<CoverageTier, CoverageType[]> = {
  inpatient: ["inpatient"],
  inpatient_outpatient: ["inpatient", "outpatient"],
  dental: ["inpatient", "outpatient", "dental"],
  maternity: ["inpatient", "outpatient", "dental", "maternity"],
};

export const TIER_LABELS: Record<CoverageTier, string> = {
  inpatient: "Inpatient only",
  inpatient_outpatient: "Inpatient + Outpatient",
  dental: "+ Dental",
  maternity: "+ Maternity",
};

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const RELATIONS = ["spouse", "child"] as const;
export type Relation = (typeof RELATIONS)[number];

/** A spouse or child on the same policy. Priced at their own age band. */
export interface Dependant {
  relation: Relation;
  age: number;
  gender: Gender;
}

/** The household is capped so one submission can't explode the price. */
export const MAX_DEPENDANTS = 10;

export const DELIVERY_CHANNELS = ["email", "whatsapp"] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export interface Profile {
  fullName: string | null;
  country: string | null; // ISO 3166-1 alpha-2, country of expatriation / residence
  nationality: string | null; // ISO 3166-1 alpha-2
  age: number | null;
  gender: Gender | null;
  effectiveDate: string | null; // YYYY-MM-DD
  dependants: Dependant[];
  coverageTier: CoverageTier | null;
  deliveryChannel: DeliveryChannel | null;
}

export const EMPTY_PROFILE: Profile = {
  fullName: null,
  country: null,
  nationality: null,
  age: null,
  gender: null,
  effectiveDate: null,
  dependants: [],
  coverageTier: null,
  deliveryChannel: null,
};

/** Coverage types implied by the chosen tier, for the quotes engine and the CRM export. */
export function coverageForTier(tier: CoverageTier | null): CoverageType[] {
  return tier ? TIER_COVERAGE[tier] : [];
}

/** Ages of everyone besides the applicant, in the order they were added. */
export function dependantAges(dependants: Dependant[]): number[] {
  return dependants.map((d) => d.age);
}

/**
 * One-line, human-readable household — "Spouse 42 (F), Child 10 (M), Child 7 (F)".
 * Shared by the system prompt and the CSV export so both read the same way.
 */
export function describeDependants(dependants: Dependant[]): string {
  return dependants
    .map((d) => {
      const relation = d.relation === "spouse" ? "Spouse" : "Child";
      return `${relation} ${d.age} (${d.gender === "male" ? "M" : "F"})`;
    })
    .join(", ");
}

/** True once the form has been submitted for this conversation. */
export function hasSubmittedProfile(profile: Profile): boolean {
  return profile.coverageTier !== null && profile.age !== null && profile.country !== null;
}
