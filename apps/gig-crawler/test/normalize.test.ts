import { describe, it, expect } from "vitest";
import { normalizeTitle } from "../src/utils/normalize.js";
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
