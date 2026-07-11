import { describe, it, expect } from "vitest";
import { normalizeTitle, titlesLikelySame } from "../src/utils/normalize.js";
import { normalizeVenueName } from "../src/models/venueAliases.js";
import { cleanEventTitle } from "../src/utils/cleanTitle.js";
import { normalizePrice } from "../src/utils/normalizePrice.js";

// These are the building blocks of gig identity/dedup, so their behaviour is what makes
// "the same event from two sources" resolve to one row.

describe("normalizeTitle", () => {
  it("folds case, punctuation and accents so variants match", () => {
    expect(normalizeTitle("Motörhead")).toBe(normalizeTitle("Motorhead"));
    expect(normalizeTitle("A & B")).toBe(normalizeTitle("A / B"));
    expect(normalizeTitle("  The Cure!  ")).toBe("the cure");
  });

  it("folds Greek capitals that look like Latin ones", () => {
    expect(normalizeTitle("ΝΤOUVAS")).toBe(normalizeTitle("NTOUVAS"));
  });

  it("folds ALL-CAPS and mixed-case Greek to the same form", () => {
    expect(normalizeTitle("ΘΟΔΩΡΗΣ ΜΑΡΑΝΤΙΝΗΣ")).toBe(normalizeTitle("Θοδωρης Μαραντινης"));
  });
});

describe("titlesLikelySame", () => {
  it("matches a partial billing (token subset)", () => {
    expect(titlesLikelySame("Krista Papista", "Krista Papista Heartmode")).toBe(true);
    expect(titlesLikelySame("EJEKT FESTIVAL 2026", "EJEKT FESTIVAL")).toBe(true);
    expect(titlesLikelySame("The Cure", "Florence + The Machine, The Cure")).toBe(true);
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
});

describe("normalizeVenueName", () => {
  it("maps known aliases to the canonical venue name", () => {
    expect(normalizeVenueName("fuzz")).toBe("Fuzz Club");
    expect(normalizeVenueName("Fuzz Live Music Club")).toBe("Fuzz Club");
  });

  it("collapses Plateia Nerou onto the Release Athens festival", () => {
    expect(normalizeVenueName("Plateia Nerou")).toBe("Release Athens");
  });

  it("returns an unknown venue unchanged", () => {
    expect(normalizeVenueName("Some New Venue")).toBe("Some New Venue");
  });

  it("matches aliases through punctuation variants", () => {
    expect(normalizeVenueName("Gazarte - Roof Stage")).toBe("Gazarte");
  });

  it("collapses sub-space and prefix variants of institutional venues", () => {
    expect(normalizeVenueName("Πειραιως 260 - Πλατεια")).toBe("Πειραιώς 260");
    expect(normalizeVenueName("Πειραιως 260")).toBe("Πειραιώς 260");
    expect(normalizeVenueName("Δημοτικο Κηποθεατρο Παπαγου")).toBe("Κηποθέατρο Παπάγου");
    expect(normalizeVenueName("Κηποθεατρο Παπαγου")).toBe("Κηποθέατρο Παπάγου");
  });

  it("maps PLYFA across scripts and annex labels", () => {
    expect(normalizeVenueName("ΠΛΥΦΑ")).toBe("PLYFA");
    expect(normalizeVenueName("PLYFA Building 7C")).toBe("PLYFA");
    expect(normalizeVenueName("plyfa")).toBe("PLYFA");
  });
});

describe("cleanEventTitle", () => {
  it("strips a trailing 'at <venue>' location suffix", () => {
    expect(cleanEventTitle("Pantera at Fuzz Club")).toBe("Pantera");
  });

  it("strips a leading venue/festival prefix", () => {
    expect(cleanEventTitle("Release Athens 2026 / Pantera", "Release Athens")).toBe("Pantera");
  });

  it("strips a trailing country tag", () => {
    expect(cleanEventTitle("Elder (USA)")).toBe("Elder");
  });

  it("keeps co-headline bills intact", () => {
    expect(cleanEventTitle("Megadeth / Sepultura")).toBe("Megadeth / Sepultura");
  });
});

describe("normalizePrice", () => {
  it("keeps the minimum as a single € value", () => {
    expect(normalizePrice("€47, €50, €52")).toBe("€47");
    expect(normalizePrice("18€")).toBe("€18");
    expect(normalizePrice("€20-€30")).toBe("€20");
  });

  it("recognizes Free and Sold Out", () => {
    expect(normalizePrice("Free entry")).toBe("Free");
    expect(normalizePrice("SOLD OUT")).toBe("Sold Out");
  });

  it("returns undefined when there is no usable price", () => {
    expect(normalizePrice("N/A")).toBeUndefined();
    expect(normalizePrice(undefined)).toBeUndefined();
  });
});
