/**
 * Greek capital letters that are visually identical to Latin ones. Sources mix scripts
 * in ALL-CAPS titles (e.g. "ΝΤOUVAS" = Greek Ν+Τ then Latin OUVAS), so the same event
 * from two sources otherwise fails to match. Folded to Latin for matching only.
 */
const GREEK_CONFUSABLES: Record<string, string> = {
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
};

/**
 * Normalize a gig title for fuzzy matching and dedup: fold Greek/Latin homoglyphs, strip
 * diacritics, lowercase, drop punctuation and separators (so "A & B", "A / B", "A - B" and
 * "Motörhead"/"Motorhead" all collapse), and squeeze whitespace. Used both to dedupe within
 * a run and to match a gig against an existing CMS row, so script/accent/punctuation variants
 * from different sources resolve to the same event. Matching-only - display titles are kept.
 *
 * Strips diacritics and uppercases BEFORE folding: the confusables are defined on plain
 * capitals (where the scripts are visually identical), so folding must see every letter as
 * an unaccented capital - otherwise an ALL-CAPS Greek title half-transliterates to
 * pseudo-Latin while its mixed-case or accented variant stays Greek, and the two can never
 * match.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toUpperCase()
    .replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, (c) => GREEK_CONFUSABLES[c] ?? c)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// The same-event title matcher built on top of this normalizer (titleTokens,
// isStrictSubset, editDistanceAtMost, titlesLikelySame) lives in titleMatch.ts.
