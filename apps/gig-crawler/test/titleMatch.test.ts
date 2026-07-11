import { describe, it, expect } from "vitest";
import { titlesLikelySame, titleTokens, isStrictSubset } from "../src/utils/titleMatch.js";

// The same-event matcher IS gig identity (fuzzy title + same day - callers guarantee the
// day), so its behaviour is what makes "the same event from two sources" resolve to one
// row without merging different same-night events.

describe("titlesLikelySame", () => {
  it("matches a partial billing (token subset)", () => {
    expect(titlesLikelySame("Krista Papista", "Krista Papista Heartmode")).toBe(true);
    expect(titlesLikelySame("EJEKT FESTIVAL 2026", "EJEKT FESTIVAL")).toBe(true);
    expect(titlesLikelySame("The Cure", "Florence + The Machine, The Cure")).toBe(true);
  });

  it("matches a marketing-tail variant of the same billing", () => {
    // The prod duplicate this matcher exists for: fuzzclub.gr vs more.com, 25 Sep 2026.
    expect(titlesLikelySame("TITO & TARANTULA", "TITO & TARANTULA live in Greece!")).toBe(true);
  });

  it("matches '&'/'and' and case/punctuation variants of the same act", () => {
    expect(titlesLikelySame("Tito and Tarantula", "TITO & TARANTULA")).toBe(true);
    expect(titlesLikelySame("Motörhead", "MOTORHEAD")).toBe(true);
  });

  it("tolerates a small typo in long titles", () => {
    expect(titlesLikelySame("MONSIER MINIMAL", "Monsieur Minimal")).toBe(true);
    expect(titlesLikelySame("Ευρυδικη - Θοδωρης Μαραντινης", "ΕΥΡΙΔΙΚΗ - ΘΟΔΩΡΗΣ ΜΑΡΑΝΤΙΝΗΣ")).toBe(
      true
    );
  });

  it("never fuzzy-matches differing digits or short titles", () => {
    expect(titlesLikelySame("Temple Live 11/7", "Temple Live 12/7")).toBe(false);
    expect(titlesLikelySame("AC/DC", "AB/DC")).toBe(false);
    expect(titlesLikelySame("Band A", "Band B")).toBe(false);
  });

  it("never matches unrelated acts that merely share a word", () => {
    expect(titlesLikelySame("Acid Baby Jesus", "Acid Mothers Temple")).toBe(false);
    expect(titlesLikelySame("Jazz Jam", "Jazz Night")).toBe(false);
  });
});

describe("titleTokens / isStrictSubset", () => {
  it("token-subset is strict: equal sets are not subsets", () => {
    expect(isStrictSubset(titleTokens("Megadeth"), titleTokens("Megadeth / Sepultura"))).toBe(true);
    expect(isStrictSubset(titleTokens("Megadeth"), titleTokens("MEGADETH"))).toBe(false);
    expect(isStrictSubset(titleTokens("Megadeth / Sepultura"), titleTokens("Megadeth"))).toBe(
      false
    );
  });
});
