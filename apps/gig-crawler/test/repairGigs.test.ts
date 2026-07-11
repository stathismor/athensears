import { describe, it, expect } from "vitest";
import type { GigsPort } from "../src/ports/GigsPort.js";
import { RepairGigsCommand } from "../src/commands/RepairGigsCommand.js";
import { InMemoryGigsPort, TEST_DATE } from "./helpers.js";

/** Seed a stored gig exactly as legacy production rows look: venue name un-canonicalized. */
async function seed(port: GigsPort, title: string, venueName: string): Promise<void> {
  const venueId = await port.createVenue({ name: venueName });
  await port.createGig({ title, date: TEST_DATE, venueName, genres: [] }, venueId);
}

describe("RepairGigsCommand", () => {
  it("merges same-event rows whose titles drifted (subset billing)", async () => {
    const port = new InMemoryGigsPort();
    await seed(port, "Krista Papista Heartmode", "Πειραιως 260 - Πλατεια");
    await seed(port, "Krista Papista", "Πειραιως 260");
    const report = await new RepairGigsCommand(port).execute();
    expect(report.merged.length).toBe(1);
    expect(port.count()).toBe(1);
    expect(port.first().title).toBe("Krista Papista Heartmode");
    expect(port.first().venueName).toBe("Πειραιώς 260");
  });

  it("merges rows split across venue-spelling variants", async () => {
    const port = new InMemoryGigsPort();
    await seed(port, "Exotica Lunatica", "ΠΛΥΦΑ");
    await seed(port, "Exotica Lunatica", "PLYFA Building 7C");
    await seed(port, "Exotica Lunatica", "PLYFA");
    const report = await new RepairGigsCommand(port).execute();
    expect(report.merged.length).toBe(2);
    expect(port.count()).toBe(1);
    expect(port.first().venueName).toBe("PLYFA");
  });

  it("leaves distinct events on the same day alone", async () => {
    const port = new InMemoryGigsPort();
    await seed(port, "Veronica Swift", "Gazarte");
    await seed(port, "Jazz Week on the roof", "Gazarte");
    await seed(port, "Acid Baby Jesus", "Death Disco");
    const report = await new RepairGigsCommand(port).execute();
    expect(report.merged.length).toBe(0);
    expect(port.count()).toBe(3);
  });

  it("merges the prod-shaped duplicate: placeholder venue + marketing-tail title", async () => {
    // Exactly the stored Tito & Tarantula pair: a venue-source row at Fuzz Club and a
    // more.com row under the "Multiple venues" placeholder with a fuller-looking title.
    const port = new InMemoryGigsPort();
    const v1 = await port.createVenue({ name: "Fuzz Club" });
    await port.createGig(
      {
        title: "TITO & TARANTULA",
        date: TEST_DATE,
        venueName: "Fuzz Club",
        genres: ["Rock"],
        url: "https://www.fuzzclub.gr/event/tito-tarantula/",
        source: "fuzz-club",
        sourceKey: "https://www.fuzzclub.gr/event/tito-tarantula",
      },
      v1
    );
    const v2 = await port.createVenue({ name: "Multiple venues" });
    await port.createGig(
      {
        title: "TITO & TARANTULA live in Greece!",
        date: TEST_DATE,
        venueName: "Multiple venues",
        genres: ["Blues", "Rock"],
        url: "https://www.more.com/gr-en/tickets/music/tito-tarantula-live-in-greece/",
        price: "€25",
        source: "more-com",
        sourceKey: "https://www.more.com/gr-en/tickets/music/tito-tarantula-live-in-greece",
      },
      v2
    );

    const report = await new RepairGigsCommand(port).execute();
    expect(report.merged.length).toBe(1);
    expect(port.count()).toBe(1);
    expect(port.first().title).toBe("TITO & TARANTULA"); // tail cleaned, not adopted
    expect(port.first().venueName).toBe("Fuzz Club"); // venue-source provenance wins
    expect(port.first().price).toBe("€25"); // backfilled from the duplicate
  });
});
