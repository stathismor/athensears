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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize an event title to the clean act name — city- and source-agnostic.
 *
 * Strips, in order:
 *  1. a leading prefix that only repeats the venue/festival (+ optional year), e.g.
 *     "Release Athens 2026 / Pantera" -> "Pantera" (only when `venueName` is given);
 *  2. a trailing venue/location suffix: " at X", " @ X", or the Greek locative
 *     " στα/στο/στη/στην/στον/στις X" — e.g. "Artist at Island" / "Μπάντα στα Αστέρια";
 *  3. a trailing "(live) in/at <city>" tail — e.g. "Elder (USA) live in Athens" (driven
 *     by `cityAliases` so it generalizes to any city);
 *  4. a trailing country tag: "(US)", "(USA)", "(FR)";
 *  5. trailing subtitle noise: anniversary tags, quoted show names, "| …" tails.
 *
 * Co-headline bills ("Megadeth / Sepultura", "A • B • C") are preserved — only
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

  // 2) Trailing venue/location suffix.
  t = t
    .replace(/\s+(?:@|\bat)\s+.+$/iu, "")
    .replace(/\s+στ(?:α|ο|η|ην|ον|ις|ους)\s+.+$/iu, "")
    .trim();

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

  // 5) Trailing subtitle noise.
  t = t
    .replace(/\s*[|–-]\s*\d+\s+years?\s+anniversary.*$/iu, "")
    .replace(/\s+"[^"]{2,}"\s*$/u, "")
    .replace(/\s+“[^”]{2,}”\s*$/u, "")
    .replace(/\s+'[^']{2,}'\s*$/u, "")
    .replace(/\s+‘[^’]{2,}’\s*$/u, "")
    .replace(/\s*\|\s.*$/u, "")
    .trim();

  return t || raw.trim();
}
