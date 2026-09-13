/**
 * ISO 3166-1 alpha-2 codes and display names, mirroring
 * `frontend/lib/country-codes.ts` — the list a visitor picks their country of
 * residence from. Generated from that file; the two must stay in step, which is
 * why the count is asserted in the unit test.
 *
 * The backend needs it to resolve the country names printed on an insurer's
 * rate card into the codes a conversation stores.
 */
export const COUNTRIES: ReadonlyArray<readonly [string, string]> = [
  ["AF", "Afghanistan"],
  ["AL", "Albania"],
  ["DZ", "Algeria"],
  ["AD", "Andorra"],
  ["AO", "Angola"],
  ["AG", "Antigua & Barbuda"],
  ["AR", "Argentina"],
  ["AM", "Armenia"],
  ["AW", "Aruba"],
  ["AU", "Australia"],
  ["AT", "Austria"],
  ["AZ", "Azerbaijan"],
  ["BS", "Bahamas"],
  ["BH", "Bahrain"],
  ["BD", "Bangladesh"],
  ["BB", "Barbados"],
  ["BY", "Belarus"],
  ["BE", "Belgium"],
  ["BZ", "Belize"],
  ["BJ", "Benin"],
  ["BM", "Bermuda"],
  ["BT", "Bhutan"],
  ["BO", "Bolivia"],
  ["BA", "Bosnia & Herzegovina"],
  ["BW", "Botswana"],
  ["BR", "Brazil"],
  ["BN", "Brunei"],
  ["BG", "Bulgaria"],
  ["BF", "Burkina Faso"],
  ["BI", "Burundi"],
  ["KH", "Cambodia"],
  ["CM", "Cameroon"],
  ["CA", "Canada"],
  ["CV", "Cape Verde"],
  ["KY", "Cayman Islands"],
  ["CF", "Central African Republic"],
  ["TD", "Chad"],
  ["CL", "Chile"],
  ["CN", "China"],
  ["CO", "Colombia"],
  ["KM", "Comoros"],
  ["CG", "Congo - Brazzaville"],
  ["CD", "Congo - Kinshasa"],
  ["CR", "Costa Rica"],
  ["CI", "Côte d'Ivoire"],
  ["HR", "Croatia"],
  ["CU", "Cuba"],
  ["CY", "Cyprus"],
  ["CZ", "Czechia"],
  ["DK", "Denmark"],
  ["DJ", "Djibouti"],
  ["DM", "Dominica"],
  ["DO", "Dominican Republic"],
  ["EC", "Ecuador"],
  ["EG", "Egypt"],
  ["SV", "El Salvador"],
  ["GQ", "Equatorial Guinea"],
  ["ER", "Eritrea"],
  ["EE", "Estonia"],
  ["SZ", "Eswatini"],
  ["ET", "Ethiopia"],
  ["FJ", "Fiji"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["GA", "Gabon"],
  ["GM", "Gambia"],
  ["GE", "Georgia"],
  ["DE", "Germany"],
  ["GH", "Ghana"],
  ["GI", "Gibraltar"],
  ["GR", "Greece"],
  ["GL", "Greenland"],
  ["GD", "Grenada"],
  ["GP", "Guadeloupe"],
  ["GT", "Guatemala"],
  ["GG", "Guernsey"],
  ["GN", "Guinea"],
  ["GW", "Guinea-Bissau"],
  ["GY", "Guyana"],
  ["HT", "Haiti"],
  ["HN", "Honduras"],
  ["HK", "Hong Kong SAR"],
  ["HU", "Hungary"],
  ["IS", "Iceland"],
  ["IN", "India"],
  ["ID", "Indonesia"],
  ["IR", "Iran"],
  ["IQ", "Iraq"],
  ["IE", "Ireland"],
  ["IM", "Isle of Man"],
  ["IL", "Israel"],
  ["IT", "Italy"],
  ["JM", "Jamaica"],
  ["JP", "Japan"],
  ["JE", "Jersey"],
  ["JO", "Jordan"],
  ["KZ", "Kazakhstan"],
  ["KE", "Kenya"],
  ["KI", "Kiribati"],
  ["KW", "Kuwait"],
  ["KG", "Kyrgyzstan"],
  ["LA", "Laos"],
  ["LV", "Latvia"],
  ["LB", "Lebanon"],
  ["LS", "Lesotho"],
  ["LR", "Liberia"],
  ["LY", "Libya"],
  ["LI", "Liechtenstein"],
  ["LT", "Lithuania"],
  ["LU", "Luxembourg"],
  ["MO", "Macao SAR"],
  ["MG", "Madagascar"],
  ["MW", "Malawi"],
  ["MY", "Malaysia"],
  ["MV", "Maldives"],
  ["ML", "Mali"],
  ["MT", "Malta"],
  ["MQ", "Martinique"],
  ["MR", "Mauritania"],
  ["MU", "Mauritius"],
  ["MX", "Mexico"],
  ["MD", "Moldova"],
  ["MC", "Monaco"],
  ["MN", "Mongolia"],
  ["ME", "Montenegro"],
  ["MA", "Morocco"],
  ["MZ", "Mozambique"],
  ["MM", "Myanmar"],
  ["NA", "Namibia"],
  ["NP", "Nepal"],
  ["NL", "Netherlands"],
  ["NC", "New Caledonia"],
  ["NZ", "New Zealand"],
  ["NI", "Nicaragua"],
  ["NE", "Niger"],
  ["NG", "Nigeria"],
  ["MK", "North Macedonia"],
  ["NO", "Norway"],
  ["OM", "Oman"],
  ["PK", "Pakistan"],
  ["PS", "Palestine"],
  ["PA", "Panama"],
  ["PG", "Papua New Guinea"],
  ["PY", "Paraguay"],
  ["PE", "Peru"],
  ["PH", "Philippines"],
  ["PL", "Poland"],
  ["PT", "Portugal"],
  ["PR", "Puerto Rico"],
  ["QA", "Qatar"],
  ["RE", "Réunion"],
  ["RO", "Romania"],
  ["RU", "Russia"],
  ["RW", "Rwanda"],
  ["WS", "Samoa"],
  ["SM", "San Marino"],
  ["ST", "São Tomé & Príncipe"],
  ["SA", "Saudi Arabia"],
  ["SN", "Senegal"],
  ["RS", "Serbia"],
  ["SC", "Seychelles"],
  ["SL", "Sierra Leone"],
  ["SG", "Singapore"],
  ["SK", "Slovakia"],
  ["SI", "Slovenia"],
  ["SB", "Solomon Islands"],
  ["SO", "Somalia"],
  ["ZA", "South Africa"],
  ["KR", "South Korea"],
  ["SS", "South Sudan"],
  ["ES", "Spain"],
  ["LK", "Sri Lanka"],
  ["KN", "St Kitts & Nevis"],
  ["LC", "St Lucia"],
  ["VC", "St Vincent & Grenadines"],
  ["SD", "Sudan"],
  ["SR", "Suriname"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["SY", "Syria"],
  ["TW", "Taiwan"],
  ["TJ", "Tajikistan"],
  ["TZ", "Tanzania"],
  ["TH", "Thailand"],
  ["TL", "Timor-Leste"],
  ["TG", "Togo"],
  ["TO", "Tonga"],
  ["TT", "Trinidad & Tobago"],
  ["TN", "Tunisia"],
  ["TR", "Türkiye"],
  ["TM", "Turkmenistan"],
  ["TC", "Turks & Caicos Islands"],
  ["UG", "Uganda"],
  ["UA", "Ukraine"],
  ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["UY", "Uruguay"],
  ["UZ", "Uzbekistan"],
  ["VU", "Vanuatu"],
  ["VE", "Venezuela"],
  ["VN", "Vietnam"],
  ["YE", "Yemen"],
  ["ZM", "Zambia"],
  ["ZW", "Zimbabwe"],
];

/**
 * Aggressive but reversible normalisation for matching printed names. Case,
 * accents, punctuation and the words insurers vary on are removed — but never
 * "island" or "republic", which distinguish real countries from one another
 * (Congo, and the several Virgin Islands).
 */
const STOP_WORDS = new Set(["the", "of", "saint", "st"]);

export function normalizeCountryName(value: string): string {
  const words = value
    .toLowerCase()
    .normalize("NFD")
    // Combining diacritical marks: "Türkiye" -> "turkiye", "Côte" -> "cote".
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ");

  // Filtered word by word rather than with a \b regex - a stop word must never
  // match inside another word ("st" inside "usa" was exactly that bug).
  return words.filter((word) => word.length > 0 && !STOP_WORDS.has(word)).join(" ");
}

/**
 * Names insurers print that normalisation alone cannot resolve — abbreviations,
 * former names, the insurer's own typos. Mapped to the correct ISO code even
 * when the code is absent from the visitor-facing dial list, because the area
 * map belongs to the insurer's product, not to our UI.
 */
export const COUNTRY_NAME_ALIASES: Readonly<Record<string, string>> = {
  usa: "US",
  uae: "AE",
  ksa: "SA",
  turkey: "TR", // listed as "Türkiye"
  "czech republic": "CZ", // listed as "Czechia"
  macedonia: "MK", // listed as "North Macedonia"
  "east timor": "TL", // listed as "Timor-Leste"
  swaziland: "SZ", // listed as "Eswatini"
  "outer mongolia": "MN",
  "papa new guinea": "PG", // VUMI's typo for Papua
  "hong kong": "HK",
  "macau sar": "MO",
  "cote d ivoire ivory coast": "CI",
  "palestine west bank and gaza": "PS",
  "democratic republic congo": "CD",
  "republic congo": "CG",
  "cocos island": "CC",
  "christmas island": "CX",
  "cook islands": "CK",
  "marshall islands": "MH",
  "faroe islands": "FO",
  "british virgin islands": "VG",
  "french polynesia": "PF",
  martin: "MF", // "St Martin" — "st" is stripped by normalisation
  anguilla: "AI",
  tuvalu: "TV",
  palau: "PW",
  nauru: "NR",
};

const BY_NAME = new Map<string, string>();
for (const [iso, name] of COUNTRIES) BY_NAME.set(normalizeCountryName(name), iso);

const VALID_ISO = new Set(COUNTRIES.map(([iso]) => iso));

/**
 * Printed country name to ISO code, or null when it cannot be resolved — never
 * a guess. An unresolved name is reported to the admin rather than dropped,
 * because a silently missing country is a silently missing price.
 */
export function resolveCountryIso(printed: string): string | null {
  const key = normalizeCountryName(printed);
  if (!key) return null;
  return BY_NAME.get(key) ?? COUNTRY_NAME_ALIASES[key] ?? null;
}

/** True when the code is one a visitor can actually select in the lead gate. */
export function isSelectableIso(iso: string): boolean {
  return VALID_ISO.has(iso);
}

const NAME_BY_ISO = new Map(COUNTRIES.map(([iso, name]) => [iso, name]));

/**
 * Display name for a code, for messages a visitor reads ("not available in your
 * country (Lebanon)"). Null for an unknown code so the caller can fall back to
 * the code itself rather than printing "undefined".
 */
export function countryNameFor(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return NAME_BY_ISO.get(iso.toUpperCase()) ?? null;
}
