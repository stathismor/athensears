import { normalizeTitle } from "./normalize.js";

/**
 * The same-event title matcher. Decides whether two gig titles (already known to be on
 * the same calendar day) name the same real-world event. Identity is deliberately
 * fuzzy(title) + day and nothing else: the same act does not play two venues on one
 * night, while the same event routinely carries different venue text across sources
 * (an aggregator placeholder like "Multiple venues", or a drifted spelling) - so the
 * venue must never be part of identity, only of the merged record's metadata.
 */

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
 * Whether two titles very likely name the same event, GIVEN they are on the same
 * calendar day (callers must ensure that - this check alone is far too loose otherwise).
 * True when the normalized titles are equal, when one billing is a strict token-subset of
 * the other ("Megadeth" vs "Megadeth / Sepultura"), or when they differ by a small typo
 * ("MONSIER MINIMAL" vs "Monsieur Minimal"). The typo tolerance is deliberately guarded:
 * digits must match exactly (so "Temple Live 11/7" never matches "Temple Live 12/7") and
 * short titles get no tolerance at all. These guards carry the matching safety - a looser
 * scorer would merge different same-night events long before it caught more duplicates.
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
