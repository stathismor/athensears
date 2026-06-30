/**
 * Normalize a gig title for fuzzy matching and dedup: lowercase, strip punctuation
 * and separators (so "A & B", "A / B", "A - B" all collapse), and squeeze whitespace.
 * Used both to dedupe within a run and to match a gig against an existing CMS row,
 * so punctuation variants from different sources resolve to the same event.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
