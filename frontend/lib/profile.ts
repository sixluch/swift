/** Mirror of the backend's applicant profile — see backend/src/lib/profile.ts. */

import type { CoverageType } from "./coverage";

export const COVERAGE_TIERS = [
  "inpatient",
  "inpatient_outpatient",
  "dental",
  "maternity",
] as const;
export type CoverageTier = (typeof COVERAGE_TIERS)[number];

export type Gender = "male" | "female";
export type Relation = "spouse" | "child";
export type DeliveryChannel = "email" | "whatsapp";

/** A spouse or child on the same policy. Priced at their own age band. */
export interface Dependant {
  relation: Relation;
  age: number;
  gender: Gender;
}

/** Same cap as the backend's `MAX_DEPENDANTS`. */
export const MAX_DEPENDANTS = 10;

/** What the quote form submits — the backend's `quoteFormSchema` minus `leadId`. */
export interface QuoteProfile {
  fullName: string;
  /** ISO 3166-1 alpha-2 — country of expatriation / residence. */
  country: string;
  /** ISO 3166-1 alpha-2. */
  nationality: string;
  /** YYYY-MM-DD, today or later. */
  effectiveDate: string;
  age: number;
  gender: Gender;
  dependants: Dependant[];
  coverageTier: CoverageTier;
}

export interface ChoiceOption<T extends string> {
  value: T;
  emoji: string;
  label: string;
  hint: string;
}

export const TIER_OPTIONS: ChoiceOption<CoverageTier>[] = [
  { value: "inpatient", emoji: "🏥", label: "Inpatient only", hint: "Hospital stays" },
  {
    value: "inpatient_outpatient",
    emoji: "🚶",
    label: "Inpatient + Outpatient",
    hint: "Doctor visits",
  },
  { value: "dental", emoji: "🦷", label: "+ Dental", hint: "Routine dental" },
  { value: "maternity", emoji: "🤰", label: "+ Maternity", hint: "Incl. maternity" },
];

export const TIER_LABELS: Record<CoverageTier, string> = Object.fromEntries(
  TIER_OPTIONS.map((o) => [o.value, o.label]),
) as Record<CoverageTier, string>;

/** Coverage types implied by a tier — tiers are cumulative. */
export const TIER_COVERAGE: Record<CoverageTier, CoverageType[]> = {
  inpatient: ["inpatient"],
  inpatient_outpatient: ["inpatient", "outpatient"],
  dental: ["inpatient", "outpatient", "dental"],
  maternity: ["inpatient", "outpatient", "dental", "maternity"],
};

/** Gender labels differ for children ("Boy / Girl") — the value stored is the same. */
export function genderLabel(gender: Gender, relation: Relation | "applicant"): string {
  if (relation === "child") return gender === "male" ? "Boy" : "Girl";
  return gender === "male" ? "Male" : "Female";
}

/** "Spouse 42 (F), Child 10 (M)" — matches the backend's `describeDependants`. */
export function describeDependants(dependants: Dependant[]): string {
  return dependants
    .map((d) => {
      const relation = d.relation === "spouse" ? "Spouse" : "Child";
      return `${relation} ${d.age} (${d.gender === "male" ? "M" : "F"})`;
    })
    .join(", ");
}
