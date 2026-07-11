import { editDistanceAtMost } from "./normalize.js";

/**
 * Country codes/names that sources append to disambiguate touring acts, e.g. "CRO-MAGS
 * (US)", "Elder (USA)". Stripped from the trailing parenthesis for a cleaner title.
 */
const COUNTRY_CODES = new Set([
  "US",
  "USA",
  "UK",
  "GB",
  "GR",
  "GRC",
  "FR",
  "DE",
  "IT",
  "ES",
  "PT",
  "NL",
  "BE",
  "LU",
  "SE",
  "NO",
  "FI",
  "DK",
  "IS",
  "IE",
  "AT",
  "CH",
  "PL",
  "CZ",
  "SK",
  "HU",
  "RO",
  "BG",
  "RS",
  "HR",
  "SI",
  "UA",
  "RU",
  "JP",
  "CN",
  "KR",
  "CA",
  "AU",
  "NZ",
  "BR",
  "AR",
  "MX",
  "CL",
  "IL",
  "TR",
  "ZA",
  "IN",
]);

function alphaTokens(s: string): string[] {
  return (s.toLowerCase().match(/\p{L}+|\p{N}+/gu) ?? []).filter((t) => !/^\d+$/.test(t));
}

/** Lowercase + strip diacritics (accent-insensitive), keeping the base script. */
function foldText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/** Folded significant tokens (words, or 2+ digit runs), dropping 1-char noise. */
function significantTokens(s: string): string[] {
  return (foldText(s).match(/\p{L}[\p{L}\p{N}]*|\p{N}{2,}/gu) ?? []).filter((t) => t.length >= 2);
}

/**
 * Generic place/venue-type stems (accent-folded) in the languages the sources use. A
 * trailing title segment built around one is a venue/location/series tag the source
 * appended, not part of the act - e.g. "... - Φ hill Sessions Λόφος Φιλοπάππου" or
 * "... - Κέντρο Πολιτισμού Ελληνικός Κόσμος". Matched as token *prefixes*, so Greek
 * inflection ("λόφος/λόφο/λόφου") is covered. These are common nouns, not specific venue
 * names, so the rule stays city- and venue-agnostic; an actual venue *name* in the tail
 * is caught separately by the venue-token check, letting this list stay narrow and
 * low-collision (generic words that double as band names - beach, park, hall, club - are
 * deliberately left out).
 */
const PLACE_TYPE_STEMS = [
  // Greek
  "θεατρ",
  "αμφιθεατρ",
  "ωδει",
  "μεγαρ",
  "αιθουσ",
  "στεγ",
  "λοφ",
  "κεντρ",
  "ιδρυμ",
  "φεστιβαλ",
  "αρεν",
  "γηπεδ",
  "μουσει",
  "πλατει",
  "παραλι",
  "καστρ",
  "πολιτισμ",
  "παρκ",
  // Latin / English
  "theat",
  "amphitheat",
  "odeon",
  "megaron",
  "fest",
  "session",
  "hill",
  "arena",
  "stadium",
  "waterfront",
];

/**
 * Whether a trailing title segment is a venue/location/series tag rather than an act:
 * either every significant word repeats the known venue, or it is built around a generic
 * place-type word or the active city's name.
 */
function isPlaceLikeTail(
  segment: string,
  venueTokens: ReadonlySet<string>,
  cityTokens: ReadonlySet<string>
): boolean {
  const toks = significantTokens(segment);
  if (toks.length === 0) {
    return false;
  }
  if (venueTokens.size > 0 && toks.every((t) => venueTokens.has(t))) {
    return true;
  }
  return toks.some((t) => cityTokens.has(t) || PLACE_TYPE_STEMS.some((stem) => t.startsWith(stem)));
}

/** Replace fancy dashes (figure/en/em/horizontal-bar/minus) with a plain ASCII hyphen. */
export function normalizeDashes(s: string): string {
  return s.replace(/[‒–—―−]/g, "-");
}

/**
 * Weekday words and month stems for trailing-date detection, in the languages the sources
 * use. Written accent-free: tokens are `foldText`ed before matching, and matched with one
 * edit of tolerance, so accent variants and single-letter typos ("πέμμπτη",
 * "Σεπτεμβριιου") are caught without being enumerated. Months are stems compared against
 * the token's prefix, so Greek inflection ("Σεπτεμβρίου/Σεπτέμβρη") is covered.
 */
const WEEKDAY_WORDS = [
  "δευτερα",
  "τριτη",
  "τεταρτη",
  "πεμπτη",
  "παρασκευη",
  "σαββατο",
  "κυριακη",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const MONTH_STEMS = [
  "ιανουαρ",
  "φεβρουαρ",
  "μαρτ",
  "απριλ",
  "μαι",
  "ιουν",
  "ιουλ",
  "αυγουστ",
  "σεπτεμβρ",
  "οκτωβρ",
  "νοεμβρ",
  "δεκεμβρ",
  "januar",
  "februar",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "septemb",
  "octob",
  "novemb",
  "decemb",
];

/** One edit of tolerance for words long enough to absorb it; short words must be exact. */
function fuzzyTolerance(word: string): number {
  return word.length >= 5 ? 1 : 0;
}

function isWeekdayToken(folded: string): boolean {
  return WEEKDAY_WORDS.some(
    (w) => editDistanceAtMost(folded, w, fuzzyTolerance(w)) <= fuzzyTolerance(w)
  );
}

/** Whether a folded token starts with (a near-miss of) a month stem. */
function isMonthToken(folded: string): boolean {
  return MONTH_STEMS.some((stem) => {
    if (folded.length < stem.length) {
      return false;
    }
    const tol = fuzzyTolerance(stem);
    return editDistanceAtMost(folded.slice(0, stem.length + tol), stem, tol) <= tol;
  });
}

/**
 * Strip a written-out date from the end of a title ("Σαββατο 19 Σεπτεμβριου", "Saturday
 * 19 September 2026", "19th of September"): optional weekday, day number, month, optional
 * year. Anchored on the "<day> <month>" pair so acts with numbers or month-like names
 * ("Sum 41", "May Roosevelt") survive. Works on tokens of the ORIGINAL string (folded
 * copies are used only for testing), so the cut never misaligns.
 */
function stripTrailingWrittenDate(t: string): string {
  const tokens = [...t.matchAll(/\S+/gu)].map((m) => ({
    folded: foldText(m[0]).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""),
    index: m.index,
  }));
  let i = tokens.length - 1;
  if (i >= 0 && /^(?:19|20)\d{2}$/.test(tokens[i].folded)) {
    i--; // optional year
  }
  if (i < 0 || !isMonthToken(tokens[i].folded)) {
    return t;
  }
  i--;
  if (i >= 0 && tokens[i].folded === "of") {
    i--; // "19th of September"
  }
  const day = i >= 0 ? tokens[i].folded.match(/^(\d{1,2})(?:η|ης|st|nd|rd|th)?$/u) : null;
  if (!day || Number(day[1]) < 1 || Number(day[1]) > 31) {
    return t;
  }
  i--;
  if (i >= 0 && isWeekdayToken(tokens[i].folded)) {
    i--;
  }
  if (i < 0) {
    return t; // the whole title is a date - leave it for a human
  }
  return t.slice(0, tokens[i + 1].index).trim();
}

/**
 * Strip separator punctuation left dangling at the end of a title (e.g. the colon in
 * 'Kawir: 30 Years "To Cavirs":'). Terminal marks that can be part of a name (!, ?, .,
 * closing brackets) are deliberately left alone.
 */
function stripDanglingSeparators(s: string): string {
  return s.replace(/[\s:;,|/&+-]+$/u, "").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize an event title to the clean act name - city- and source-agnostic.
 *
 * Strips, in order:
 *  1. a leading prefix that only repeats the venue/festival (+ optional year), e.g.
 *     "Release Athens 2026 / Pantera" -> "Pantera" (only when `venueName` is given);
 *  2. a trailing venue/location suffix: " at X", " @ X", or the Greek locative
 *     " στα/στο/στη/στην/στον/στις X" - e.g. "Artist at Island" / "Μπάντα στα Αστέρια";
 *  2b. trailing " - X" segment(s) where X is a venue/location/series tag - either a repeat
 *     of the known venue or something built around a generic place word ("… - Κέντρο
 *     Πολιτισμού Ελληνικός Κόσμος", "… - Φ hill Sessions Λόφος Φιλοπάππου");
 *  2c. a trailing date fragment - e.g. "The Young Gods , 2/10" -> "The Young Gods";
 *  3. a trailing "(live) in/at <city>" tail - e.g. "Elder (USA) live in Athens" (driven
 *     by `cityAliases` so it generalizes to any city);
 *  4. a trailing country tag: "(US)", "(USA)", "(FR)";
 *  5. trailing subtitle noise: anniversary tags, quoted show names, "| …" tails.
 *
 * Co-headline bills ("Megadeth / Sepultura", "A • B • C") are preserved - only
 * venue-repeating prefixes and after-the-act location suffixes are removed.
 */
export function cleanEventTitle(
  raw: string,
  venueName = "",
  cityAliases: readonly string[] = []
): string {
  let t = raw.trim();

  // 1) Leading venue/festival prefix (up to two, e.g. "Fest 2026: N-Day Offer / …").
  const venueTokens = new Set(alphaTokens(venueName));
  for (let i = 0; i < 2 && venueTokens.size > 0; i++) {
    const m = t.match(/^([^/:]{1,60})[/:]\s*(.+)$/u);
    if (!m) {
      break;
    }
    const prefixWords = alphaTokens(m[1]).filter((w) => !/^(?:19|20)\d{2}$/.test(w));
    if (prefixWords.length > 0 && prefixWords.every((w) => venueTokens.has(w))) {
      t = m[2].trim();
    } else {
      break;
    }
  }

  // 2) Trailing venue/location suffix. "@" needs no trailing space (sources write
  //    "Artist @Venue" glued together, e.g. "… @Στοά Culture"); "at" does, so it stays a
  //    whole word and never eats "… at" mid-name.
  t = t
    .replace(/\s+(?:@\s*|\bat\s+).+$/iu, "")
    .replace(/\s+στ(?:α|ο|η|ην|ον|ις|ους)\s+.+$/iu, "")
    .trim();

  // 2b) Trailing venue/location/series tail(s). Sources pad titles with the venue, the
  //     neighborhood, or a "<series> <location>" tag as extra " - " segments (e.g.
  //     "… - Κέντρο Πολιτισμού Ελληνικός Κόσμος", "… - Φ hill Sessions Λόφος Φιλοπάππου").
  //     Strip them from the end while the last dash-segment looks like a place - but always
  //     keep the leading act, so co-headline bills ("A - B", B an act) survive intact.
  const venueNameTokens = new Set(significantTokens(venueName));
  const cityTokens = new Set(cityAliases.map((a) => foldText(a)));
  for (let i = 0; i < 3; i++) {
    const m = t.match(/^(.*\S)\s+[-–—]\s+(\S.*)$/u);
    if (!m || !isPlaceLikeTail(m[2], venueNameTokens, cityTokens)) {
      break;
    }
    t = m[1].trim();
  }

  // 2c) Trailing date fragment the source tacks on ("The Young Gods , 2/10", "… 2/10/2026").
  //     A day/month(/year) in d/m or d.m form is never part of an act name; strip it plus any
  //     leading comma/dash. Bare numbers ("Sum 41", "blink-182") have no separator, so survive.
  t = t.replace(/[\s,]*[-–—]?\s*\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*$/u, "").trim();

  // 2d) Trailing written-out date ("Σαββατο 19 Σεπτεμβριου", "Saturday 19 September 2026") -
  //     fold-and-fuzzy token matching, see stripTrailingWrittenDate.
  t = stripTrailingWrittenDate(t);

  // 3) Trailing "(live) in/at <city>" tail (e.g. "Elder (USA) live in Athens").
  if (cityAliases.length > 0) {
    const alt = cityAliases.map(escapeRegExp).join("|");
    t = t
      .replace(
        new RegExp(`\\s+(?:live\\s+)?(?:in|at|στ(?:ην|η|ον|α|ο))\\s+(?:${alt})\\b.*$`, "iu"),
        ""
      )
      .trim();
  }

  // 4) Trailing country tag.
  t = t
    .replace(/\s*[([]\s*([A-Za-z.]{2,4})\s*[)\]]\s*$/u, (m, code: string) =>
      COUNTRY_CODES.has(code.replace(/\./g, "").toUpperCase()) ? "" : m
    )
    .trim();

  // 5) Trailing subtitle noise. Dangling separators are stripped first so a quoted
  //    subtitle followed by a stray colon ('… "To Cavirs":') still counts as trailing.
  t = stripDanglingSeparators(t);
  t = t
    .replace(/\s*[|–-]\s*\d+\s+years?\s+anniversary.*$/iu, "")
    .replace(/\s+"[^"]{2,}"\s*$/u, "")
    .replace(/\s+“[^”]{2,}”\s*$/u, "")
    .replace(/\s+'[^']{2,}'\s*$/u, "")
    .replace(/\s+‘[^’]{2,}’\s*$/u, "")
    .replace(/\s*\|\s.*$/u, "")
    .trim();

  // 6) Normalize fancy dashes (en/em/figure/minus) to a plain hyphen, and drop any
  //    separator the strips above left dangling.
  t = stripDanglingSeparators(normalizeDashes(t));

  return t || raw.trim();
}
