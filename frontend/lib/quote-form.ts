/**
 * Pure state and rules for the quote form, kept out of the component so they
 * can be unit-tested (`npx tsx lib/profile.test.ts`).
 *
 * The draft holds strings the way the inputs do; `validateQuoteForm` is the
 * only place a draft becomes a typed `QuoteProfile`. The backend re-validates
 * with the same rules (`quoteFormSchema`) and stays the source of truth.
 */

import {
  MAX_DEPENDANTS,
  type CoverageTier,
  type Dependant,
  type Gender,
  type QuoteProfile,
  type Relation,
} from "./profile";

export interface DependantDraft {
  /** Stable React key — a removed row must not re-key its neighbours. */
  id: string;
  relation: Relation;
  age: string;
  gender: Gender | "";
}

export interface QuoteFormDraft {
  fullName: string;
  country: string;
  nationality: string;
  effectiveDate: string;
  age: string;
  gender: Gender | "";
  dependants: DependantDraft[];
  coverageTier: CoverageTier | "";
}

export const EMPTY_DRAFT: QuoteFormDraft = {
  fullName: "",
  country: "",
  nationality: "",
  effectiveDate: "",
  age: "",
  gender: "",
  dependants: [],
  coverageTier: "",
};

/** Keyed by field; dependant rows use `dependants.<index>` so the row can show its own message. */
export type QuoteFormErrors = Record<string, string>;

export const AGE_MESSAGE = "Enter an age between 0 and 120.";

/** Today as YYYY-MM-DD in local time — what a `<input type="date">` compares against. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseAge(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const age = Number(trimmed);
  return age >= 0 && age <= 120 ? age : null;
}

let nextId = 0;
export function newDependant(relation: Relation): DependantDraft {
  nextId += 1;
  return { id: `${relation}-${nextId}`, relation, age: "", gender: "" };
}

/**
 * Client-side mirror of the backend rules. Returns the typed profile when the
 * draft is complete, or the per-field messages to render when it isn't.
 */
export function validateQuoteForm(
  draft: QuoteFormDraft,
  today: string = todayIso(),
): { profile: QuoteProfile; errors: null } | { profile: null; errors: QuoteFormErrors } {
  const errors: QuoteFormErrors = {};

  const fullName = draft.fullName.trim();
  if (!fullName) errors.fullName = "Tell us the applicant's name.";
  else if (fullName.length > 100) errors.fullName = "That name is too long.";

  if (!draft.country) errors.country = "Pick a country from the list.";
  if (!draft.nationality) errors.nationality = "Pick a country from the list.";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveDate) || draft.effectiveDate < today) {
    errors.effectiveDate = "Pick a start date from today onwards.";
  }

  const age = parseAge(draft.age);
  if (age === null) errors.age = AGE_MESSAGE;

  if (!draft.gender) errors.gender = "Pick male or female.";

  if (draft.dependants.length > MAX_DEPENDANTS) {
    errors.dependants = `Up to ${MAX_DEPENDANTS} family members per quote.`;
  }

  const dependants: Dependant[] = [];
  draft.dependants.forEach((row, index) => {
    const rowAge = parseAge(row.age);
    if (rowAge === null) errors[`dependants.${index}`] = AGE_MESSAGE;
    else if (!row.gender) {
      errors[`dependants.${index}`] =
        row.relation === "child" ? "Pick boy or girl." : "Pick male or female.";
    } else dependants.push({ relation: row.relation, age: rowAge, gender: row.gender });
  });

  if (!draft.coverageTier) errors.coverageTier = "Pick a cover level.";

  if (Object.keys(errors).length > 0) return { profile: null, errors };

  return {
    profile: {
      fullName,
      country: draft.country,
      nationality: draft.nationality,
      effectiveDate: draft.effectiveDate,
      age: age as number,
      gender: draft.gender as Gender,
      dependants,
      coverageTier: draft.coverageTier as CoverageTier,
    },
    errors: null,
  };
}

const STORAGE_KEY = "swiftbroker.quoteForm";

/**
 * The last submitted profile survives a reload so the form comes back filled
 * in; the quotes themselves do not — the visitor presses COMPARE again, which
 * keeps every snapshot the backend records a deliberate act.
 */
export function storeProfile(profile: QuoteProfile): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable — the form just won't survive a reload.
  }
}

export function readStoredProfile(): QuoteProfile | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QuoteProfile) : null;
  } catch {
    return null; // Corrupt entry — start blank.
  }
}

/** The draft a submitted profile round-trips to, for the Edit button. */
export function draftFromProfile(profile: QuoteProfile): QuoteFormDraft {
  return {
    fullName: profile.fullName,
    country: profile.country,
    nationality: profile.nationality,
    effectiveDate: profile.effectiveDate,
    age: String(profile.age),
    gender: profile.gender,
    dependants: profile.dependants.map((d) => ({
      ...newDependant(d.relation),
      age: String(d.age),
      gender: d.gender,
    })),
    coverageTier: profile.coverageTier,
  };
}
