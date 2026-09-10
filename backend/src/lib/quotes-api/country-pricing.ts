/**
 * Country-of-residence price multipliers for the mock provider.
 *
 * Deliberately cheap: a factor per country, no rate tables. The bands mirror the
 * shape of the VUMI "Area" model (Area 1 = USA is by far the most expensive,
 * Area 11 = Western Europe / Gulf next, and so on) so demo numbers move the way
 * real ones do — a US quote landing at roughly twice a Lebanon quote. When a real
 * insurer's rate card is loaded this file is replaced by actual rate lookups.
 *
 * Unlisted countries fall back to DEFAULT_FACTOR rather than erroring, so a new
 * country in the dropdown can never break a quote.
 */

export const DEFAULT_FACTOR = 1.0;

const BAND_1 = 2.3; // USA — the outlier in every real rate table
const BAND_2 = 1.55; // Western Europe, Gulf, developed Asia-Pacific
const BAND_3 = 1.0; // Levant, wider Europe, Latin America, Caribbean
const BAND_4 = 0.8; // North & Southern Africa, SE Asia, Central Asia
const BAND_5 = 0.62; // Indian subcontinent, Sub-Saharan Africa

const band = (factor: number, isos: string[]): Record<string, number> =>
  Object.fromEntries(isos.map((iso) => [iso, factor]));

export const COUNTRY_FACTORS: Record<string, number> = {
  ...band(BAND_1, ["US", "PR"]),

  ...band(BAND_2, [
    "AE", "AT", "AU", "BE", "BR", "CA", "CH", "DE", "DK", "FI", "FR", "GB", "GG",
    "IE", "IM", "IT", "JE", "JP", "KR", "LU", "MC", "MO", "MX", "NL", "NO", "NZ",
    "SA", "SE", "SG", "HK",
  ]),

  ...band(BAND_3, [
    "AD", "AG", "AR", "AW", "BB", "BH", "BM", "BS", "BZ", "CL", "CO", "CR", "CY",
    "CZ", "DM", "DO", "EC", "ES", "GD", "GI", "GL", "GP", "GR", "GT", "GY", "HN",
    "HR", "HT", "HU", "IL", "IQ", "IS", "JM", "KN", "KW", "KY", "LB", "LC", "LI",
    "MQ", "MT", "NI", "PA", "PE", "PT", "PY", "QA", "SM", "SR", "SV", "TC", "TR",
    "TT", "UY", "VC", "VE",
  ]),

  ...band(BAND_4, [
    "AL", "AM", "AZ", "BA", "BG", "BY", "CN", "DZ", "EE", "EG", "GE", "ID",
    "IR", "JO", "KZ", "LT", "LV", "LY", "MA", "MD", "ME", "MK", "MN", "MU", "MY",
    "OM", "PL", "PS", "RO", "RS", "RU", "SC", "SI", "SK", "SY", "TH", "TN", "TW",
    "UA", "VN", "ZA",
  ]),

  ...band(BAND_5, [
    "AF", "AO", "BD", "BF", "BI", "BJ", "BT", "BW", "CD", "CF", "CG", "CI", "CM",
    "CV", "DJ", "ER", "ET", "GA", "GH", "GM", "GN", "GQ", "GW", "IN", "KE", "KG",
    "KH", "KM", "LA", "LK", "LR", "LS", "MG", "ML", "MM", "MR", "MV", "MW", "MZ",
    "NA", "NE", "NG", "NP", "PK", "RW", "SD", "SL", "SN", "SO", "SS", "ST", "SZ",
    "TD", "TG", "TJ", "TM", "TZ", "UG", "UZ", "YE", "ZM", "ZW",
  ]),
};

/** Multiplier for a country of residence; 1.0 for anything unlisted. */
export function countryFactor(iso: string | null | undefined): number {
  if (!iso) return DEFAULT_FACTOR;
  return COUNTRY_FACTORS[iso.toUpperCase()] ?? DEFAULT_FACTOR;
}
