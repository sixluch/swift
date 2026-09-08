export type CoverageType = "inpatient" | "outpatient" | "dental" | "maternity";

export interface CoverageOption {
  id: CoverageType;
  label: string;
  emoji: string;
}

/** Multi-select — any combination can be active at once (vibe prompt §3.4, §10). */
export const COVERAGE_OPTIONS: CoverageOption[] = [
  { id: "inpatient", label: "Inpatient", emoji: "🛏" },
  { id: "outpatient", label: "Outpatient", emoji: "🚶" },
  { id: "dental", label: "Dental", emoji: "🦷" },
  { id: "maternity", label: "Maternity", emoji: "🤰" },
];
