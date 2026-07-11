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

/** Significant tokens of a title (normalized words). */
export function titleTokens(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter(Boolean));
}

/** True if `a` is a strict subset of `b` (every token of a is in b, and a is smaller). */
export function isStrictSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || a.size >= b.size) {
    return false;
  }
  for (const t of a) {
    if (!b.has(t)) {
      return false;
    }
  }
  return true;
}

/** Levenshtein distance, abandoning early once every path already exceeds `max`. */
export function editDistanceAtMost(a: string, b: string, max: number): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) {
      return rowMin;
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Whether two titles very likely name the same event, GIVEN they already share the same
 * day + venue (callers must ensure that - this check alone is far too loose otherwise).
 * True when the normalized titles are equal, when one billing is a strict token-subset of
 * the other ("Megadeth" vs "Megadeth / Sepultura"), or when they differ by a small typo
 * ("MONSIER MINIMAL" vs "Monsieur Minimal"). The typo tolerance is deliberately guarded:
 * digits must match exactly (so "Temple Live 11/7" never matches "Temple Live 12/7") and
 * short titles get no tolerance at all.
 */
export function titlesLikelySame(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) {
    return true;
  }
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  if (isStrictSubset(ta, tb) || isStrictSubset(tb, ta)) {
    return true;
  }
  const digits = (s: string): string => (s.match(/\d+/g) ?? []).join(" ");
  if (digits(na) !== digits(nb)) {
    return false;
  }
  const maxLen = Math.max(na.length, nb.length);
  const maxDist = maxLen >= 24 ? 2 : maxLen >= 12 ? 1 : 0;
  if (maxDist === 0 || Math.abs(na.length - nb.length) > maxDist) {
    return false;
  }
  return editDistanceAtMost(na, nb, maxDist) <= maxDist;
}
