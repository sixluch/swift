/**
 * Working out what to call a product when a rate card is parsed. Cosmetic — no
 * price depends on it — but a card called "Rate card" is no use in a list.
 * Pure, so it can be run directly: `npx tsx src/lib/rate-cards/product-name.ts`.
 */

const BOILERPLATE = /^(rate|rates|table|tables|premium|premiums)$/i;

/**
 * The insurer prints the product name in the page furniture, e.g. VUMI's
 * "GLOBAL FLEX VIP" up the spine of every page.
 */
export function productNameFromText(lines: string[], marker = "FLEX"): string | null {
  const match = lines.find(
    (line) => /^[A-Z][A-Z0-9 ]{4,40}$/.test(line) && line.includes(marker),
  );
  if (!match) return null;
  return titleCase(match.split(/\s+/));
}

/** "Rate-Tables-Global-Flex-VIP-20262.pdf" → "Global Flex VIP". */
export function productNameFromFilename(filename: string): string | null {
  const words = filename
    .replace(/\.pdf$/i, "")
    .split(/[-_\s]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    // Drop the year/version suffix and the boilerplate every rate card carries.
    .filter((word) => !/^\d+$/.test(word))
    .filter((word) => !BOILERPLATE.test(word));

  return words.length > 0 ? titleCase(words) : null;
}

function titleCase(words: string[]): string {
  return words
    .map((word) =>
      // A short acronym stays in capitals (VIP, USA, HMO, PPO). Four letters is
      // already long enough to be a word — "FLEX" is not an acronym.
      word === word.toUpperCase() && word.length <= 3
        ? word
        : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}
