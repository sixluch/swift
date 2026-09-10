import type { CoverageType } from "./quotes-api/types.js";

/**
 * The mandatory question sequence. The backend — not the model — decides which
 * question comes next, so a step can never be skipped or asked twice. The model
 * only supplies the wording and handles anything the user says off-script.
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

export const PLAN_TYPES = ["individual", "family"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const DELIVERY_CHANNELS = ["email", "whatsapp"] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export interface Profile {
  fullName: string | null;
  country: string | null; // ISO 3166-1 alpha-2, country of residence
  nationality: string | null; // ISO 3166-1 alpha-2
  age: number | null;
  planType: PlanType | null;
  familyAges: string | null; // free text, as the user phrased it
  coverageTier: CoverageTier | null;
  deliveryChannel: DeliveryChannel | null;
}

export const EMPTY_PROFILE: Profile = {
  fullName: null,
  country: null,
  nationality: null,
  age: null,
  planType: null,
  familyAges: null,
  coverageTier: null,
  deliveryChannel: null,
};

/** Every slot the flow can ask for, in the order the client specified. */
export const SLOTS = [
  "fullName",
  "country",
  "nationality",
  "age",
  "planType",
  "familyAges",
  "coverageTier",
  "deliveryChannel",
] as const;
export type Slot = (typeof SLOTS)[number];

/** What the assistant should ask for each slot — the model rephrases in its own voice. */
export const SLOT_QUESTIONS: Record<Slot, string> = {
  fullName: "Ask the user for their name.",
  country: "Ask which country they live in.",
  nationality: "Ask for their nationality.",
  age: "Ask how old they are.",
  planType: "Ask whether the quote is just for them or if they are adding family members.",
  familyAges:
    "Ask, in these words: \"Great — what are the ages of the others? (e.g. your partner 42, kids 10 and 7)\"",
  coverageTier: "Ask what type of cover they are looking for.",
  deliveryChannel:
    "Ask, in these words: \"One last thing — where should we send your quote? Pop in your email (or WhatsApp number) and we'll email you the comparison to keep; an adviser from " +
    "SwiftHealth may follow up to help.\" Then let them choose email or WhatsApp.",
};

/** Slots answered by clicking a card or picking from a dropdown, not by typing. */
export const UI_ANSWERED_SLOTS: Slot[] = [
  "country",
  "nationality",
  "planType",
  "coverageTier",
  "deliveryChannel",
];

/** Family ages are only asked when the user said they are adding family. */
function isSlotApplicable(slot: Slot, profile: Profile): boolean {
  if (slot === "familyAges") return profile.planType === "family";
  return true;
}

function isSlotFilled(slot: Slot, profile: Profile): boolean {
  const value = profile[slot];
  return value !== null && value !== undefined && value !== "";
}

/**
 * The next question to ask, or null when there is nothing to ask right now.
 * Delivery is only asked once quotes exist, so the flow is:
 *   profile slots → getQuotes → delivery.
 */
export function nextSlot(profile: Profile, quotesShown: boolean): Slot | null {
  for (const slot of SLOTS) {
    if (slot === "deliveryChannel") continue; // handled below
    if (!isSlotApplicable(slot, profile)) continue;
    if (!isSlotFilled(slot, profile)) return slot;
  }

  if (!quotesShown) return null; // everything collected — time to call getQuotes
  if (!isSlotFilled("deliveryChannel", profile)) return "deliveryChannel";
  return null;
}

/** True once every answer getQuotes depends on has been collected. */
export function isReadyForQuotes(profile: Profile): boolean {
  return (
    isSlotFilled("fullName", profile) &&
    isSlotFilled("country", profile) &&
    isSlotFilled("nationality", profile) &&
    isSlotFilled("age", profile) &&
    isSlotFilled("planType", profile) &&
    (profile.planType !== "family" || isSlotFilled("familyAges", profile)) &&
    isSlotFilled("coverageTier", profile)
  );
}

/** The slots still missing before quotes can be fetched — used in error messages. */
export function missingForQuotes(profile: Profile): Slot[] {
  return SLOTS.filter(
    (slot) =>
      slot !== "deliveryChannel" &&
      isSlotApplicable(slot, profile) &&
      !isSlotFilled(slot, profile),
  );
}

/** Coverage types implied by the chosen tier, for the quotes engine and the CRM export. */
export function coverageForTier(tier: CoverageTier | null): CoverageType[] {
  return tier ? TIER_COVERAGE[tier] : [];
}
