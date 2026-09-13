/**
 * The four underlying coverage types the quotes engine understands.
 *
 * The UI no longer exposes these as independent toggles — visitors pick one
 * cumulative tier instead (see `lib/profile.ts`), which maps down to this set.
 */
export type CoverageType = "inpatient" | "outpatient" | "dental" | "maternity";
