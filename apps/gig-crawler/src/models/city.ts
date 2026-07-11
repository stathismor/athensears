/**
 * City configuration - the single place that makes the crawler city-specific.
 *
 * Everything else (scraping, extraction, dedup, title cleaning) is city-agnostic and
 * reads from the ACTIVE_CITY below. To target another city, add a CityConfig and point
 * ACTIVE_CITY at it (and populate that city's source registry in sources.ts).
 */
export interface CityConfig {
  /** Display name, e.g. "Athens". */
  name: string;
  /**
   * Lowercased name variants used for text-based city matching (e.g. the LLM
   * "only this city" rule). Include local-language spellings.
   */
  nameAliases: string[];
  /**
   * Lowercased name variants of the city's country (Latin + local script, accented and
   * not). Used ONLY to strip "live in <country>" marketing tails from titles - never for
   * city matching, since "in Greece" does not imply the target city.
   */
  countryAliases: string[];
  /** How to geo-filter events from the more.com aggregator (which is region-coarse). */
  moreCom: {
    /**
     * Accepted more.com `area<N>` region ids. more.com tags each event with a region;
     * Athens' region is Attica = "1". A region can be broader than the city (Attica
     * includes the Saronic islands), so pair this with `excludeLocales`.
     */
    areaIds: string[];
    /**
     * Lowercased, accent-insensitive place-name stems that are inside the region but
     * NOT the target city (for Athens: the Saronic islands and far-Attica towns). An
     * event whose venue or title contains one is dropped. Include local + Latin spellings.
     * This fails safe: an unknown out-of-city locale shows up (visible, easy to add here)
     * rather than a whitelist silently dropping legit new venues.
     */
    excludeLocales: string[];
  };
}

export const ATHENS: CityConfig = {
  name: "Athens",
  nameAliases: ["athens", "αθήνα", "αθηνα"],
  countryAliases: ["greece", "hellas", "ελλάδα", "ελλαδα"],
  moreCom: {
    areaIds: ["1"], // Attica
    excludeLocales: [
      // Saronic islands (administratively Attica, not Athens)
      "αιγιν",
      "aegina",
      "aigina",
      "πορο", // Poros
      "poros",
      "υδρα",
      "hydra",
      "σπετσ",
      "spetses",
      "κυθηρα",
      "kythira",
      "σαλαμιν", // Salamina
      "salamina",
      // Far-Attica mainland towns
      "λαυριο",
      "lavrio",
      "μαραθων",
      "marathon",
      "μεγαρα",
      "megara",
      "σουνιο",
      "sounio",
    ],
  },
};

/** The city this deployment serves. Swap for another CityConfig to target a new city. */
export const ACTIVE_CITY: CityConfig = ATHENS;

/**
 * Aliases a source may append to a title as a "(live) in/at <place>" marketing tail: the
 * city's own names plus its country's ("TITO & TARANTULA live in Greece!"). This is what
 * the title cleaner should be fed - it is deliberately broader than `nameAliases`, which
 * stays city-only for the "is this event in our city" checks.
 */
export function placeTailAliases(city: CityConfig = ACTIVE_CITY): string[] {
  return [...city.nameAliases, ...city.countryAliases];
}

/** Lowercase + strip diacritics, for accent-insensitive locale matching. */
function foldForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/** True if the given venue/title text names a locale excluded from the active city. */
export function isExcludedLocale(text: string, city: CityConfig = ACTIVE_CITY): boolean {
  const hay = foldForMatch(text);
  return city.moreCom.excludeLocales.some((stem) => hay.includes(stem));
}
